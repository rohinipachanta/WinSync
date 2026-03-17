import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import pgSession from "connect-pg-simple";
import { pool } from "./db";

const scryptAsync = promisify(scrypt);
const PostgresStore = pgSession(session);

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

  // Setup session
  app.use(
    session({
      store: new PostgresStore({
        pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "your_secret_key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
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
  app.post(api.auth.register.path, async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }

      const input = api.auth.register.input.parse(req.body);
      const hashedPassword = await hashPassword(input.password);
      const user = await storage.createUser({ ...input, password: hashedPassword });
      
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({ id: user.id, username: user.username });
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      next(err);
    }
  });

  app.post(api.auth.login.path, passport.authenticate("local"), (req, res) => {
    const user = req.user as any;
    res.status(200).json({ id: user.id, username: user.username });
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

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
      // Postmark inbound payload
      const fromEmail: string = req.body?.From ?? req.body?.FromFull?.Email ?? "";
      const subject: string   = req.body?.Subject ?? "";
      const textBody: string  = req.body?.TextBody ?? req.body?.StrippedTextReply ?? "";
      const htmlBody: string  = req.body?.HtmlBody ?? "";

      if (!fromEmail) return res.status(400).json({ message: "No sender found" });

      // Match sender to a user by stored email
      const user = await storage.getUserByEmail(fromEmail);
      if (!user) {
        console.log(`Inbound email from unknown sender: ${fromEmail}`);
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
      const model  = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
    } catch (err) {
      console.error("Inbound email error:", err);
      res.status(500).json({ message: "Failed to process email" });
    }
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
