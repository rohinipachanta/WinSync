import { pgTable, text, serial, integer, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  coachingCount: integer("coaching_count").default(0).notNull(),
  xp: integer("xp").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  email: text("email"),                              // user's real email for matching inbound forwards
  weeklyReminder: boolean("weekly_reminder").default(false).notNull(), // opt-in weekly recap email
});

export const badges = pgTable("badges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'first_achievement', 'five_achievements', 'coaching_pro'
  awardedAt: timestamp("awarded_at").defaultNow(),
});

export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  achievementDate: date("achievement_date").notNull(),
  coachingResponse: text("coaching_response"),
  xpEarned: integer("xp_earned").default(10).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  // Winsync fields
  feedbackType: text("feedback_type").default("win").notNull(), // 'win' | 'constructive' | 'coaching'
  source: text("source").default("self").notNull(),             // 'gmail' | 'slack' | 'granola' | 'self'
  fromPerson: text("from_person"),                              // who gave the feedback
  isConfirmed: integer("is_confirmed").default(1).notNull(),    // 1 = confirmed, 0 = pending digest
  dismissedAt: timestamp("dismissed_at"),                       // null = active, set = soft-deleted
});

export const insertUserSchema = createInsertSchema(users, {
  // Enforce minimum password length on both client and server
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export const insertAchievementSchema = createInsertSchema(achievements).pick({
  title: true,
  achievementDate: true,
  feedbackType: true,
  source: true,
  fromPerson: true,
  isConfirmed: true,
}).partial({ feedbackType: true, source: true, fromPerson: true, isConfirmed: true });
export const insertBadgeSchema = createInsertSchema(badges);

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type Badge = typeof badges.$inferSelect;
export type InsertBadge = z.infer<typeof insertBadgeSchema>;
