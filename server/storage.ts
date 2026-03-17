import { users, achievements, badges, type User, type InsertUser, type Achievement, type InsertAchievement, type Badge, type InsertBadge } from "@shared/schema";
import { db } from "./db";
import { eq, sql, desc, isNull, isNotNull } from "drizzle-orm";
import { encryptText, decryptText } from "./encryption";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAchievements(userId: number): Promise<Achievement[]>;
  getDismissedAchievements(userId: number): Promise<Achievement[]>;
  createAchievement(userId: number, achievement: InsertAchievement): Promise<Achievement>;
  getAchievement(id: number): Promise<Achievement | undefined>;
  updateAchievement(id: number, coachingResponse: string): Promise<void>;
  editAchievement(id: number, title: string, feedbackType: string, achievementDate: string): Promise<void>;
  confirmAchievement(id: number): Promise<void>;
  deleteAchievement(id: number): Promise<void>;   // soft-delete (sets dismissed_at)
  restoreAchievement(id: number): Promise<void>;  // clears dismissed_at
  incrementCoachingCount(userId: number): Promise<number>;
  updateUserPassword(id: number, password: string): Promise<void>;
  updateUserEmail(id: number, email: string): Promise<void>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateWeeklyReminder(id: number, enabled: boolean): Promise<void>;
  getAllUsersWithReminders(): Promise<User[]>;
  getBadges(userId: number): Promise<Badge[]>;
  awardBadge(userId: number, type: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAchievements(userId: number): Promise<Achievement[]> {
    const rawAchievements = await db
      .select()
      .from(achievements)
      .where(sql`${achievements.userId} = ${userId} AND ${achievements.dismissedAt} IS NULL`)
      .orderBy(desc(achievements.achievementDate), desc(achievements.id));
    
    // Decrypt achievement titles
    const decryptedAchievements = await Promise.all(
      rawAchievements.map(async (achievement) => ({
        ...achievement,
        title: await decryptText(achievement.title),
      }))
    );
    
    return decryptedAchievements;
  }

  async createAchievement(userId: number, insertAchievement: InsertAchievement): Promise<Achievement> {
    const xpEarned = 10;
    
    // Encrypt the achievement title before storing
    const encryptedTitle = await encryptText(insertAchievement.title);
    
    // Apply explicit defaults for optional fields to avoid NOT NULL violations
    const [achievement] = await db
      .insert(achievements)
      .values({
        ...insertAchievement,
        title:        encryptedTitle,
        userId,
        xpEarned,
        feedbackType: insertAchievement.feedbackType ?? "win",
        source:       insertAchievement.source       ?? "self",
        isConfirmed:  insertAchievement.isConfirmed  ?? 1,
      })
      .returning();

    // Update user XP and level
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user) {
      const newXp = (user.xp || 0) + xpEarned;
      const newLevel = Math.floor(newXp / 50) + 1;
      await db.update(users).set({ xp: newXp, level: newLevel }).where(eq(users.id, userId));
      
      // Check for badges
      const userAchievements = await this.getAchievements(userId);
      if (userAchievements.length === 1) {
        await this.awardBadge(userId, 'first_achievement');
      } else if (userAchievements.length === 5) {
        await this.awardBadge(userId, 'five_achievements');
      }
    }
    
    // Return decrypted version for immediate display
    return {
      ...achievement,
      title: insertAchievement.title, // Return original unencrypted title
    };
  }

  async getBadges(userId: number): Promise<Badge[]> {
    return db.select().from(badges).where(eq(badges.userId, userId));
  }

  async awardBadge(userId: number, type: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(badges)
      .where(sql`${badges.userId} = ${userId} AND ${badges.type} = ${type}`);
    
    if (!existing) {
      await db.insert(badges).values({ userId, type });
    }
  }

  async getAchievement(id: number): Promise<Achievement | undefined> {
    // NOTE: does NOT filter by dismissedAt — this lets the restore route find dismissed items
    const [achievement] = await db.select().from(achievements).where(eq(achievements.id, id));
    if (!achievement) return undefined;
    return { ...achievement, title: await decryptText(achievement.title) };
  }

  async updateAchievement(id: number, coachingResponse: string): Promise<void> {
    await db.update(achievements).set({ coachingResponse }).where(eq(achievements.id, id));
  }

  async editAchievement(id: number, title: string, feedbackType: string, achievementDate: string): Promise<void> {
    const encryptedTitle = await encryptText(title);
    await db.update(achievements)
      .set({ title: encryptedTitle, feedbackType, achievementDate })
      .where(eq(achievements.id, id));
  }

  async confirmAchievement(id: number): Promise<void> {
    await db.update(achievements).set({ isConfirmed: 1 }).where(eq(achievements.id, id));
  }

  async getDismissedAchievements(userId: number): Promise<Achievement[]> {
    const rawAchievements = await db
      .select()
      .from(achievements)
      .where(sql`${achievements.userId} = ${userId} AND ${achievements.dismissedAt} IS NOT NULL`)
      .orderBy(desc(achievements.dismissedAt));
    return Promise.all(
      rawAchievements.map(async (a) => ({ ...a, title: await decryptText(a.title) }))
    );
  }

  async deleteAchievement(id: number): Promise<void> {
    // Soft-delete: set dismissed_at so the item can be restored later
    await db.update(achievements).set({ dismissedAt: new Date() }).where(eq(achievements.id, id));
  }

  async restoreAchievement(id: number): Promise<void> {
    await db.update(achievements).set({ dismissedAt: null }).where(eq(achievements.id, id));
  }

  async incrementCoachingCount(userId: number): Promise<number> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const newCount = (user?.coachingCount || 0) + 1;
    await db.update(users).set({ coachingCount: newCount }).where(eq(users.id, userId));
    return newCount;
  }

  async updateUserPassword(id: number, password: string): Promise<void> {
    await db.update(users).set({ password }).where(eq(users.id, id));
  }

  async updateUserEmail(id: number, email: string): Promise<void> {
    await db.update(users).set({ email: email.toLowerCase().trim() }).where(eq(users.id, id));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()));
    return user;
  }

  async updateWeeklyReminder(id: number, enabled: boolean): Promise<void> {
    await db.update(users).set({ weeklyReminder: enabled }).where(eq(users.id, id));
  }

  async getAllUsersWithReminders(): Promise<User[]> {
    return db.select().from(users).where(eq(users.weeklyReminder, true));
  }
}

export const storage = new DatabaseStorage();
