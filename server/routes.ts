import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import pgSession from "connect-pg-simple";
import { pool } from "./db";
import { sendTestEmail } from "./email";
import { sendWeeklyReminders } from "./scheduler";

const scryptAsync = promisify(scrypt);
const PostgresStore = pgSession(session);
const MemSession = MemoryStore(session);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePassword(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

const COACHING_LIMIT = 5;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Trust proxy for secure cookies behind Railway's reverse proxy
  app.set("trust proxy", 1);

  // Version check — registered FIRST so it's always available regardless of session setup
  app.get("/api/version", (_req, res) => {
    res.json({ version: "2026-03-17-v6", status: "ok" });
  });

  // Setup session — try Postgres first, fall back to memory store
  let sessionStore;
  try {
    sessionStore = new PostgresStore({ pool, createTableIfMissing: true });
    console.log("[session] Using PostgresStore");
  } catch (err: any) {
    console.warn("[session] PostgresStore failed, using MemoryStore:", err?.message);
    sessionStore = new MemSession({ checkPeriod: 86400000 });
  }

  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || "winsync_secret_key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Incorrect username." });
        }
        const isValid = await comparePassword(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Incorrect password." });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Auth Routes
  app.post(api.auth.register.path, async (req, res) => {
    const errMsg = (err: any) =>
      err?.message || err?.detail || (typeof err === "string" ? err : JSON.stringify(err)) || "Unknown error";

    try {
      console.log("[register] step 1: checking existing user");
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }

      console.log("[register] step 2: parsing input");
      const input = api.auth.register.input.parse(req.body);

      console.log("[register] step 3: hashing password");
      const hashedPassword = await hashPassword(input.password);

      console.log("[register] step 4: creating user in DB");
      const user = await storage.createUser({ ...input, password: hashedPassword });

      console.log("[register] step 5: creating session");
      await new Promise<void>((resolve) => {
        req.login(user, (err) => {
          if (err) {
            console.error("[register] session error (non-fatal):", errMsg(err));
          }
          resolve(); // continue even if session fails
        });
      });

      console.log("[register] step 6: sending response");
      return res.status(201).json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[register] caught error:", errMsg(err), err);
      return res.status(500).json({ message: errMsg(err) });
    }
  });

  app.post(api.auth.login.path, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      const errMsg = (e: any) =>
        e?.message || e?.detail || (typeof e === "string" ? e : JSON.stringify(e)) || "Unknown error";

      if (err) {
        console.error("[login] passport error:", errMsg(err));
        return res.status(500).json({ message: errMsg(err) });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message ?? "Invalid username or password" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("[login] session error:", errMsg(loginErr));
          return res.status(500).json({ message: errMsg(loginErr) });
        }
        return res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post(api.auth.logout.path, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get(api.auth.user.path, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }
    const user = req.user as any;
    const badges = await storage.getBadges(user.id);
    res.json({ ...user, badges });
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }
    const user = req.user as any;
    const badges = await storage.getBadges(user.id);
    res.json({ ...user, badges });
  });

  app.post("/api/reset-password", async (req, res) => {
    try {
      const { username, newPassword } = z.object({
        username: z.string(),
        newPassword: z.string().min(6),
      }).parse(req.body);

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);

      res.status(200).json({ message: "Password updated successfully" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Achievement Routes
  app.get(api.achievements.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const achievements = await storage.getAchievements((req.user as any).id);
    res.json(achievements);
  });

  app.post(api.achievements.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = api.achievements.create.input.parse(req.body);
      const achievement = await storage.createAchievement((req.user as any).id, input);
      res.status(201).json(achievement);
    } catch (err) {
      console.error("Achievement creation error:", err);
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  app.post("/api/achievements/:id/coach", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).id;
    const achievementId = parseInt(req.params.id);

    try {
      const user = await storage.getUser(userId);
      if (!user) return res.sendStatus(401);
      if (user.coachingCount >= COACHING_LIMIT) {
        return res.status(403).json({ message: "Coaching limit reached. Each user gets 10 requests for testing." });
      }

      const achievement = await storage.getAchievement(achievementId);
      if (!achievement) return res.status(404).json({ message: "Achievement not found" });
      if (achievement.userId !== userId) return res.sendStatus(401);

      const feedbackType = achievement.feedbackType || "win";
      const prompt = feedbackType === "constructive"
        ? `You are a career coach helping someone grow from constructive feedback they received at work.

The feedback was: "${achievement.title}"

Please provide:
1. What this feedback is really saying — translate it from vague to specific and actionable
2. A personal action plan with 2-3 concrete things to practice
3. How to track progress and know when it's improving

Keep it warm, specific, and encouraging. Format clearly with short paragraphs.`
        : `You are a career coach helping someone document and articulate their professional wins.

The win or achievement: "${achievement.title}"

Please provide:
1. How to reframe this for maximum impact in a performance review
2. Specific talking points that highlight the business value
3. How to quantify or measure the impact if possible

Keep it professional, specific, and confident. Format clearly with short paragraphs.`;

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      const coachingResponse = result.response.text() || "No response from AI.";
      await storage.updateAchievement(achievementId, coachingResponse);
      await storage.incrementCoachingCount(userId);

      res.json({ coachingResponse });
    } catch (err) {
      console.error("Coaching error:", err);
      res.status(500).json({ message: "Failed to get coaching advice" });
    }
  });

  // Confirm a digest item (mark as confirmed)
  app.patch("/api/achievements/:id/confirm", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).id;
    const achievementId = parseInt(req.params.id);
    try {
      const achievement = await storage.getAchievement(achievementId);
      if (!achievement) return res.status(404).json({ message: "Not found" });
      if (achievement.userId !== userId) return res.sendStatus(403);
      await storage.confirmAchievement(achievementId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to confirm" });
    }
  });

  // Edit a win's title, type, and date
  app.patch("/api/achievements/:id/edit", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).id;
    const achievementId = parseInt(req.params.id);
    const { title, feedbackType, achievementDate } = req.body;
    if (!title || !feedbackType || !achievementDate) {
      return res.status(400).json({ message: "title, feedbackType, and achievementDate are required" });
    }
    try {
      const achievement = await storage.getAchievement(achievementId);
      if (!achievement) return res.status(404).json({ message: "Not found" });
      if (achievement.userId !== userId) return res.sendStatus(403);
      await storage.editAchievement(achievementId, title, feedbackType, achievementDate);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to edit" });
    }
  });

  // Dismiss / delete an achievement
  app.delete("/api/achievements/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).id;
    const achievementId = parseInt(req.params.id);
    try {
      const achievement = await storage.getAchievement(achievementId);
      if (!achievement) return res.status(404).json({ message: "Not found" });
      if (achievement.userId !== userId) return res.sendStatus(403);
      await storage.deleteAchievement(achievementId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete" });
    }
  });

  // Update the logged-in user's email address
  app.patch("/api/user/email", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required" });
    }
    await storage.updateUserEmail((req.user as any).id, email);
    const updated = await storage.getUser((req.user as any).id);
    res.json(updated);
  });

  // ── Inbound email webhook (called by Postmark) ─────────────────────────────
  // Postmark POSTs parsed email JSON to: POST /api/inbound-email/:secret
  // The :secret token is set via INBOUND_WEBHOOK_SECRET env var so only
  // Postmark (who has your webhook URL) can trigger it.
  app.post("/api/inbound-email/:secret", async (req, res) => {
    const expectedSecret = process.env.INBOUND_WEBHOOK_SECRET;
    if (!expectedSecret || req.params.secret !== expectedSecret) {
      return res.sendStatus(403);
    }

    try {
      // Inbound email payload (from Google Apps Script)
      const rawFrom: string      = req.body?.From ?? req.body?.FromFull?.Email ?? "";
      const rawUserEmail: string = req.body?.UserEmail ?? ""; // Winsync user's own Gmail
      const subject: string      = req.body?.Subject ?? "";
      const textBody: string     = req.body?.TextBody ?? req.body?.StrippedTextReply ?? "";
      const htmlBody: string     = req.body?.HtmlBody ?? "";

      if (!rawFrom) return res.status(400).json({ message: "No sender found" });

      // Extract plain email from "Name <email>" format
      const extractEmail = (raw: string) => {
        const m = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
        return m ? m[1].toLowerCase().trim() : raw.toLowerCase().trim();
      };

      // Use UserEmail (the person who labeled the email) for lookup
      // This is the Winsync account owner, not the email sender
      const lookupEmail = rawUserEmail ? extractEmail(rawUserEmail) : extractEmail(rawFrom);
      console.log(`Inbound: From=${rawFrom} UserEmail=${rawUserEmail} lookup=${lookupEmail}`);

      // Match the Winsync account owner by their stored email
      const user = await storage.getUserByEmail(lookupEmail);
      if (!user) {
        console.log(`No Winsync user found for email: ${lookupEmail}`);
        return res.json({ status: "ignored", reason: "sender not found" });
      }

      // Strip HTML tags from body for cleaner AI input
      const cleanBody = textBody || htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const emailContent = [subject && `Subject: ${subject}`, cleanBody && `Body: ${cleanBody.slice(0, 2000)}`]
        .filter(Boolean).join("\n");

      if (!emailContent.trim()) {
        return res.json({ status: "ignored", reason: "empty content" });
      }

      // Use Gemini to extract a win or feedback from the email
      const model  = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `You are a career tracking assistant. Someone forwarded this email to their Winsync app to log a win or feedback.

Email content:
${emailContent}

Extract the key achievement, win, or feedback. Reply with JSON only (no markdown):
{
  "title": "concise one-sentence description of the win or feedback (max 120 chars)",
  "feedbackType": "win" or "constructive",
  "fromPerson": "name of the person who gave feedback, or null if it's the user's own win"
}

Rules:
- feedbackType is "win" if it's a positive accomplishment or praise
- feedbackType is "constructive" if it's critical or developmental feedback
- Keep the title specific and action-oriented
- If the email is not about a work win or feedback, return {"title": null}`;

      const result   = await model.generateContent(prompt);
      const raw      = result.response.text().trim();
      const jsonText = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed   = JSON.parse(jsonText);

      if (!parsed.title) {
        return res.json({ status: "ignored", reason: "not a work win" });
      }

      const today = new Date().toISOString().split("T")[0];
      await storage.createAchievement(user.id, {
        title: parsed.title,
        achievementDate: today,
        feedbackType: parsed.feedbackType === "constructive" ? "constructive" : "win",
        source: "gmail",
        fromPerson: parsed.fromPerson ?? undefined,
        isConfirmed: 0,  // lands in digest for review
      });

      console.log(`Inbound win logged for user ${user.username}: ${parsed.title}`);
      res.json({ status: "ok", title: parsed.title });
    } catch (err: any) {
      console.error("Inbound email error:", err?.message ?? err);
      res.status(500).json({ message: "Failed to process email", detail: err?.message ?? String(err) });
    }
  });

  // ── Review draft generation / polishing ─────────────────────────────────────
  // POST /api/review/draft
  // Body: { wins: string[], periodLabel: string, existingDraft?: string }
  // mode: if existingDraft is provided → polish mode; otherwise → generate from wins
  app.post("/api/review/draft", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { wins, periodLabel, existingDraft } = req.body as {
      wins: string[];
      periodLabel: string;
      existingDraft?: string;
    };

    if (!wins || wins.length === 0) {
      return res.status(400).json({ message: "No wins provided." });
    }

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      let prompt: string;

      if (existingDraft) {
        // Polish / improve an existing draft
        prompt = `You are a career coach helping someone improve their performance self-review.

Here is their current draft:
"""
${existingDraft}
"""

Here are their logged wins for context (${periodLabel}):
${wins.map((w, i) => `${i + 1}. ${w}`).join("\n")}

Please improve the draft by:
- Making the language more confident and impactful
- Adding specific, action-oriented phrasing
- Ensuring it sounds professional and authentic — NOT generic corporate-speak
- Keeping all the key accomplishments but making them shine
- Keeping the structure similar but feel free to improve section titles
- Inserting [Add metric here] placeholders where a number or % would strengthen a point

Return ONLY the improved draft text with no commentary, no markdown fences.`;
      } else {
        // Generate from scratch from wins
        prompt = `You are a career coach helping someone write their performance self-review.

Period: ${periodLabel}

Their logged wins and feedback:
${wins.map((w, i) => `${i + 1}. ${w}`).join("\n")}

Write a professional self-review draft with these sections:
- KEY ACCOMPLISHMENTS (bullet-point the wins, make each one impact-focused)
- IMPACT & VALUE DELIVERED (2-3 sentence summary of overall contribution)
- AREAS OF GROWTH (briefly mention constructive feedback or growth areas — keep positive)
- GOALS FOR NEXT PERIOD (3 forward-looking bullets, the last one as a placeholder for the user to fill in)

Rules:
- Write in first person ("I delivered...", "I led...")
- Sound confident and specific, not generic
- Insert [Add metric here] placeholders where numbers would strengthen a point
- Keep it under 350 words
- Do NOT include preamble, commentary, or markdown fences — just the review text`;
      }

      const result = await model.generateContent(prompt);
      const draft  = result.response.text().trim();
      res.json({ draft });
    } catch (err: any) {
      console.error("Review draft generation error:", err?.message ?? err);
      res.status(500).json({ message: "Failed to generate draft", detail: err?.message ?? String(err) });
    }
  });

  // ── Weekly reminder toggle ──────────────────────────────────────────────────
  app.patch("/api/user/weekly-reminder", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be a boolean" });
    }
    const user = req.user as any;
    if (enabled && !user.email) {
      return res.status(400).json({ message: "Please add your email address in Settings before enabling reminders." });
    }
    await storage.updateWeeklyReminder(user.id, enabled);
    res.json({ weeklyReminder: enabled });
  });

  // ── Send a test reminder email ───────────────────────────────────────────────
  app.post("/api/user/test-reminder", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!user.email) {
      return res.status(400).json({ message: "Please add your email address in Settings first." });
    }
    try {
      await sendTestEmail(user.email, user.username);
      res.json({ message: "Test email sent! Check your inbox." });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to send test email" });
    }
  });

  // ── Manual trigger for weekly reminders (protected by secret) ───────────────
  app.post("/api/admin/send-reminders/:secret", async (req, res) => {
    const expectedSecret = process.env.INBOUND_WEBHOOK_SECRET;
    if (!expectedSecret || req.params.secret !== expectedSecret) {
      return res.sendStatus(403);
    }
    sendWeeklyReminders().catch(console.error);
    res.json({ message: "Weekly reminder job triggered" });
  });

  // Seed demo data
  const existingUser = await storage.getUserByUsername("demo");
  if (!existingUser) {
    const hashedPassword = await hashPassword("demo123");
    const user = await storage.createUser({ username: "demo", password: hashedPassword });
    const today = new Date().toISOString().split('T')[0];
    await storage.createAchievement(user.id, { title: "Created my first account", achievementDate: today });
    await storage.createAchievement(user.id, { title: "Started the achievement tracker", achievementDate: today });
  }

  return httpServer;
}
