import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAchievements } from "@/hooks/use-achievements";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAchievementSchema, type InsertAchievement, type Achievement } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from "@/components/ui/form";
import {
  LogOut, Plus, Calendar, Loader2, CheckCircle2, X, ChevronDown, ChevronUp, Sparkles, Pencil, Trash2, Check, RotateCcw, Archive, HelpCircle, Clock, BookOpen, PackageOpen
} from "lucide-react";
import { GoalsManager } from "@/components/goals-manager";
import { GoalSelector } from "@/components/goal-selector";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── Tab types ──────────────────────────────────────────────────────────────
type Tab = "digest" | "wins" | "review" | "settings";
type WinFilter = "all" | "win" | "constructive" | "coaching";

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout, isLoading: isAuthLoading } = useAuth();
  const {
    achievements,
    isLoading: isAchievementsLoading,
    createAchievement,
    confirmAchievement,
    dismissAchievement,
    editAchievement,
    requestCoaching,
    dismissedAchievements,
    restoreAchievement,
  } = useAchievements();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("digest");
  const [showHelp, setShowHelp] = useState(false);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [isWrapping, setIsWrapping] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Show "How it works" automatically on very first login
  useEffect(() => {
    if (user && !localStorage.getItem("winsync_onboarding_seen")) {
      setShowHelp(true);
      localStorage.setItem("winsync_onboarding_seen", "1");
    }
  }, [user]);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isAuthLoading, setLocation]);

  if (isAuthLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(36,33%,96%)" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "hsl(25,55%,42%)" }} />
      </div>
    );
  }

  const confirmedWins = achievements?.filter(a => a.isConfirmed === 1) ?? [];
  const pendingDigest  = achievements?.filter(a => a.isConfirmed === 0) ?? [];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(36,33%,96%)" }}>
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 px-4 pt-4 pb-3 flex items-center justify-between"
        style={{ background: "hsl(36,33%,96%)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <span className="font-display font-bold text-lg" style={{ color: "hsl(25,20%,16%)" }}>
            Winsync
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
            style={{ background: "hsl(36,20%,88%)", color: "hsl(25,40%,38%)" }}
            title="How it works"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
            style={{ background: "hsl(36,20%,88%)", color: "hsl(25,40%,35%)" }}
          >
            ⭐ {user.xp ?? 0} XP · Lv {user.level ?? 1}
          </div>
        </div>
      </header>

      {/* Modals */}
      <HowItWorksModal open={showHelp} onClose={() => setShowHelp(false)} />
      <WrapUpModal
        open={showWrapUp}
        onClose={() => setShowWrapUp(false)}
        isWrapping={isWrapping}
        onConfirm={async (name, archiveGoals) => {
          setIsWrapping(true);
          try {
            const res = await fetch("/api/seasons", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, archiveGoals }),
            });
            if (!res.ok) throw new Error((await res.json()).message || "Failed");
            setShowWrapUp(false);
            // Refetch wins so the board clears
            queryClient.invalidateQueries({ queryKey: ["/api/achievements"] });
            queryClient.invalidateQueries({ queryKey: ["/api/achievements/dismissed"] });
            toast({ title: "Season archived! 🎉", description: `"${name}" saved to Past Reviews. Starting fresh!` });
          } catch (err: any) {
            toast({ variant: "destructive", title: "Error", description: err.message });
          } finally {
            setIsWrapping(false);
          }
        }}
      />

      {/* Page content */}
      <main className="flex-1 overflow-y-auto px-4 pb-28">
        <AnimatePresence mode="wait">
          {activeTab === "digest" && (
            <DigestTab
              key="digest"
              pendingItems={pendingDigest}
              isLoading={isAchievementsLoading}
              onConfirm={(id) => confirmAchievement.mutate(id)}
              onDismiss={(id)  => dismissAchievement.mutate(id)}
              isConfirmPending={confirmAchievement.isPending}
              isDismissPending={dismissAchievement.isPending}
              onAdd={(data) => createAchievement.mutate(data)}
              isAddPending={createAchievement.isPending}
            />
          )}
          {activeTab === "wins" && (
            <WinsTab
              key="wins"
              confirmedWins={confirmedWins}
              isLoading={isAchievementsLoading}
              onAdd={(data) => createAchievement.mutate(data)}
              isAddPending={createAchievement.isPending}
              onRequestCoaching={(id) => requestCoaching.mutate(id)}
              isCoachingPending={requestCoaching.isPending}
              coachingVariable={requestCoaching.variables as number | undefined}
              onEdit={(id, title, feedbackType, achievementDate) =>
                editAchievement.mutate({ id, title, feedbackType, achievementDate })}
              onDelete={(id) => dismissAchievement.mutate(id)}
              dismissedItems={dismissedAchievements}
              onRestore={(id) => restoreAchievement.mutate(id)}
              isRestorePending={restoreAchievement.isPending}
              onWrapUp={() => setShowWrapUp(true)}
            />
          )}
          {activeTab === "review" && (
            <ReviewTab key="review" confirmedWins={confirmedWins} />
          )}
          {activeTab === "settings" && (
            <SettingsTab key="settings" user={user} onLogout={() => logout.mutate()} />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex border-t"
        style={{ background: "hsl(36,40%,98%)", borderColor: "hsl(36,20%,86%)" }}
      >
        {(
          [
            { id: "digest",   icon: "📅", label: "This Week"  },
            { id: "wins",     icon: "🏆", label: "My Wins"    },
            { id: "review",   icon: "✦",  label: "Self Review"},
            { id: "settings", icon: "⚙️", label: "Settings"  },
          ] as { id: Tab; icon: string; label: string }[]
        ).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-semibold uppercase tracking-wide transition-colors"
            style={{ color: activeTab === tab.id ? "hsl(25,55%,42%)" : "hsl(36,10%,55%)" }}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── Tab: This Week (Digest) ─────────────────────────────────────────────────
function DigestTab({
  pendingItems,
  isLoading,
  onConfirm,
  onDismiss,
  isConfirmPending,
  isDismissPending,
  onAdd,
  isAddPending,
}: {
  pendingItems: Achievement[];
  isLoading: boolean;
  onConfirm: (id: number) => void;
  onDismiss: (id: number) => void;
  isConfirmPending: boolean;
  isDismissPending: boolean;
  onAdd: (data: InsertAchievement) => void;
  isAddPending: boolean;
}) {
  const [quickTitle, setQuickTitle] = useState("");
  const [quickType, setQuickType]   = useState<"win" | "constructive">("win");
  const { toast }                   = useToast();

  const today      = new Date();
  const weekOf     = format(today, "MMM d");
  const dow        = today.getDay();
  let nextDigest   = "";
  if (dow < 3)        nextDigest = "Wednesday";
  else if (dow === 3) nextDigest = "today (Wednesday)";
  else if (dow < 5)   nextDigest = "Friday";
  else                nextDigest = "next Wednesday";

  const handleQuickLog = () => {
    if (!quickTitle.trim()) {
      toast({ variant: "destructive", title: "Nothing to save", description: "Type something first." });
      return;
    }
    onAdd({
      title: quickTitle.trim(),
      achievementDate: format(today, "yyyy-MM-dd"),
      feedbackType: quickType,
      source: "self",
    });
    setQuickTitle("");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="mt-2 mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "hsl(36,10%,55%)" }}>
          Week of {weekOf}
        </p>
        <h2 className="text-2xl font-display font-bold" style={{ color: "hsl(25,20%,16%)" }}>
          This Week's Digest
        </h2>
        <p className="text-sm mt-1" style={{ color: "hsl(36,10%,48%)" }}>
          Next digest: <span className="font-semibold">{nextDigest}</span>
        </p>
      </div>

      {/* ── Quick-log section ── */}
      <div
        className="rounded-2xl p-4 mb-6"
        style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
      >
        <p className="text-sm font-semibold mb-3" style={{ color: "hsl(25,20%,20%)" }}>
          What happened this week?
        </p>

        {/* Type toggle */}
        <div className="flex gap-2 mb-3">
          {(["win", "constructive"] as const).map(t => (
            <button
              key={t}
              onClick={() => setQuickType(t)}
              className="flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors"
              style={{
                background: quickType === t ? "hsl(25,55%,42%)" : "hsl(36,20%,90%)",
                color:      quickType === t ? "white"            : "hsl(36,10%,42%)",
              }}
            >
              {t === "win" ? "⭐ Win" : "💬 Feedback"}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={quickTitle}
            onChange={e => setQuickTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleQuickLog()}
            placeholder={
              quickType === "win"
                ? "e.g. Shipped the onboarding flow early"
                : "e.g. Manager said I should speak up more in meetings"
            }
            className="flex-1 h-10 px-3 rounded-xl text-sm outline-none"
            style={{
              background: "hsl(36,30%,94%)",
              border: "1px solid hsl(36,20%,84%)",
              color: "hsl(25,20%,16%)",
            }}
          />
          <Button
            className="h-10 px-4 rounded-xl font-semibold shrink-0"
            style={{ background: "hsl(25,55%,42%)", color: "white" }}
            onClick={handleQuickLog}
            disabled={isAddPending}
          >
            {isAddPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs mt-2" style={{ color: "hsl(36,10%,58%)" }}>
          Saved wins appear in My Wins → press Enter or tap +
        </p>
      </div>

      {/* ── Pending digest items ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "hsl(36,20%,90%)" }} />
          ))}
        </div>
      ) : pendingItems.length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "hsl(36,10%,52%)" }}>
            Suggested from your tools
          </p>
          <AnimatePresence>
            {pendingItems.map(item => (
              <DigestCard
                key={item.id}
                item={item}
                onConfirm={() => onConfirm(item.id)}
                onDismiss={() => onDismiss(item.id)}
                isConfirmPending={isConfirmPending}
                isDismissPending={isDismissPending}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Info banner */}
      <div
        className="p-4 rounded-2xl flex gap-3 items-start"
        style={{ background: "hsl(36,30%,91%)", border: "1px solid hsl(36,20%,84%)" }}
      >
        <span className="text-xl">💡</span>
        <div>
          <p className="text-sm font-semibold" style={{ color: "hsl(25,20%,20%)" }}>Auto-capture coming soon</p>
          <p className="text-xs mt-0.5" style={{ color: "hsl(36,10%,48%)" }}>
            Connect Gmail or Slack in Settings and Winsync will automatically surface wins and feedback from your tools every Wednesday and Friday — no manual logging needed.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyDigest() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">✅</div>
      <h3 className="font-display font-bold text-lg mb-2" style={{ color: "hsl(25,20%,20%)" }}>
        All caught up!
      </h3>
      <p className="text-sm max-w-xs" style={{ color: "hsl(36,10%,50%)" }}>
        No new items in your digest. Check back Wednesday or Friday when your next digest is ready.
      </p>
      <p className="text-xs mt-4" style={{ color: "hsl(36,10%,58%)" }}>
        Connect Gmail or Slack in Settings to auto-capture wins.
      </p>
    </div>
  );
}

function DigestCard({
  item,
  onConfirm,
  onDismiss,
  isConfirmPending,
  isDismissPending,
}: {
  item: Achievement;
  onConfirm: () => void;
  onDismiss: () => void;
  isConfirmPending: boolean;
  isDismissPending: boolean;
}) {
  const sourceIcon: Record<string, string> = { gmail: "📧", slack: "💬", granola: "📝", self: "✏️" };
  const typeLabel: Record<string, { bg: string; text: string; label: string }> = {
    win:          { bg: "#dcfce7", text: "#166534", label: "Win"      },
    constructive: { bg: "#fef9c3", text: "#854d0e", label: "Feedback" },
    coaching:     { bg: "#dbeafe", text: "#1e40af", label: "Coaching" },
  };
  const colours = typeLabel[item.feedbackType ?? "win"] ?? typeLabel.win;
  const icon    = sourceIcon[item.source ?? "self"] ?? "✏️";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-2xl p-4"
      style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: colours.bg, color: colours.text }}
            >
              {colours.label}
            </span>
            {item.fromPerson && (
              <span className="text-xs" style={{ color: "hsl(36,10%,50%)" }}>from {item.fromPerson}</span>
            )}
          </div>
          <p className="text-sm font-medium leading-snug" style={{ color: "hsl(25,20%,16%)" }}>
            {item.title}
          </p>
          <p className="text-xs mt-1" style={{ color: "hsl(36,10%,54%)" }}>
            {item.achievementDate
              ? format(new Date(item.achievementDate + "T00:00:00"), "MMM d, yyyy")
              : ""}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 h-9 rounded-xl text-sm font-semibold"
          style={{ background: "hsl(25,55%,42%)", color: "white" }}
          onClick={onConfirm}
          disabled={isConfirmPending}
        >
          {isConfirmPending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-9 rounded-xl text-sm font-semibold"
          style={{ borderColor: "hsl(36,20%,82%)", color: "hsl(36,10%,45%)" }}
          onClick={onDismiss}
          disabled={isDismissPending}
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Dismiss
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Tab: My Wins ────────────────────────────────────────────────────────────
function WinsTab({
  confirmedWins,
  isLoading,
  onAdd,
  isAddPending,
  onRequestCoaching,
  isCoachingPending,
  coachingVariable,
  onEdit,
  onDelete,
  dismissedItems,
  onRestore,
  isRestorePending,
  onWrapUp,
}: {
  confirmedWins: Achievement[];
  isLoading: boolean;
  onAdd: (data: InsertAchievement) => void;
  isAddPending: boolean;
  onRequestCoaching: (id: number) => void;
  isCoachingPending: boolean;
  coachingVariable: number | undefined;
  onEdit: (id: number, title: string, feedbackType: string, achievementDate: string) => void;
  onDelete: (id: number) => void;
  dismissedItems: Achievement[];
  onRestore: (id: number) => void;
  isRestorePending: boolean;
  onWrapUp: () => void;
}) {
  const [filter, setFilter]     = useState<WinFilter>("all");
  const [showForm, setShowForm] = useState(false);

  const filtered     = confirmedWins.filter(a => filter === "all" || a.feedbackType === filter);
  const winCount     = confirmedWins.filter(a => a.feedbackType === "win").length;
  const feedbackCount = confirmedWins.filter(a => a.feedbackType === "constructive").length;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      {/* Header */}
      <div className="mt-2 mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold" style={{ color: "hsl(25,20%,16%)" }}>My Wins</h2>
          <p className="text-sm" style={{ color: "hsl(36,10%,50%)" }}>Your career story, always ready.</p>
        </div>
        <Button
          size="sm"
          className="rounded-xl h-9 px-4 font-semibold"
          style={{ background: "hsl(25,55%,42%)", color: "white" }}
          onClick={() => setShowForm(v => !v)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Log win
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Total",    value: confirmedWins.length, emoji: "🏆" },
          { label: "Wins",     value: winCount,             emoji: "⭐" },
          { label: "Feedback", value: feedbackCount,        emoji: "💬" },
        ].map(s => (
          <div
            key={s.label}
            className="rounded-2xl p-3 text-center"
            style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
          >
            <div className="text-lg">{s.emoji}</div>
            <div className="text-xl font-display font-bold" style={{ color: "hsl(25,20%,16%)" }}>{s.value}</div>
            <div className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Goals section */}
      <GoalsManager />

      {/* Log win form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-5"
          >
            <div
              className="rounded-2xl p-4"
              style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
            >
              <h3 className="font-display font-semibold text-base mb-3" style={{ color: "hsl(25,20%,20%)" }}>
                Log a Win or Feedback
              </h3>
              <LogWinForm
                onSubmit={(data) => { onAdd(data); setShowForm(false); }}
                isPending={isAddPending}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter chips */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {(["all", "win", "constructive", "coaching"] as WinFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={{
              background: filter === f ? "hsl(25,55%,42%)" : "hsl(36,20%,90%)",
              color:      filter === f ? "white"            : "hsl(36,10%,42%)",
            }}
          >
            {f === "all" ? "All" : f === "win" ? "Wins" : f === "constructive" ? "Feedback" : "Coaching"}
          </button>
        ))}
      </div>

      {/* Win cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "hsl(36,20%,90%)" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14">
          <div className="text-4xl mb-3">🌱</div>
          <p className="font-medium" style={{ color: "hsl(36,10%,48%)" }}>
            {filter === "all"
              ? "No wins yet — tap 'Log win' to start!"
              : `No ${filter} entries yet.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((a, i) => (
              <WinCard
                key={a.id}
                achievement={a}
                index={i}
                onRequestCoaching={() => onRequestCoaching(a.id)}
                isCoachingPending={isCoachingPending && coachingVariable === a.id}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Dismissed / archived items ── */}
      <DismissedSection
        items={dismissedItems}
        onRestore={onRestore}
        isRestorePending={isRestorePending}
      />

      {/* ── Wrap up this season ── */}
      {confirmedWins.length > 0 && (
        <div className="mt-8 mb-4">
          <div
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{ background: "hsl(36,30%,93%)", border: "1px solid hsl(36,20%,85%)" }}
          >
            <PackageOpen className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "hsl(25,40%,45%)" }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold mb-0.5" style={{ color: "hsl(25,20%,20%)" }}>
                Review season complete?
              </p>
              <p className="text-xs mb-3" style={{ color: "hsl(36,10%,50%)" }}>
                Archive all your current wins and draft into Past Reviews and start fresh for the next cycle.
              </p>
              <Button
                size="sm"
                className="h-9 px-4 rounded-xl text-xs font-semibold"
                style={{ background: "hsl(25,55%,42%)", color: "white" }}
                onClick={onWrapUp}
              >
                📦 Wrap up this season
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Dismissed section ───────────────────────────────────────────────────────
function DismissedSection({
  items,
  onRestore,
  isRestorePending,
}: {
  items: Achievement[];
  onRestore: (id: number) => void;
  isRestorePending: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  const typeLabel: Record<string, { bg: string; text: string; label: string }> = {
    win:          { bg: "#dcfce7", text: "#166534", label: "Win"      },
    constructive: { bg: "#fef9c3", text: "#854d0e", label: "Feedback" },
    coaching:     { bg: "#dbeafe", text: "#1e40af", label: "Coaching" },
  };

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left py-2"
      >
        <Archive className="w-3.5 h-3.5" style={{ color: "hsl(36,10%,52%)" }} />
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "hsl(36,10%,52%)" }}>
          Dismissed ({items.length})
        </span>
        {open
          ? <ChevronUp  className="w-3.5 h-3.5 ml-auto" style={{ color: "hsl(36,10%,52%)" }} />
          : <ChevronDown className="w-3.5 h-3.5 ml-auto" style={{ color: "hsl(36,10%,52%)" }} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-2 mt-1"
          >
            {items.map(item => {
              const colours = typeLabel[item.feedbackType ?? "win"] ?? typeLabel.win;
              const displayDate = item.achievementDate
                ? format(new Date(item.achievementDate + "T00:00:00"), "MMM d, yyyy")
                : "";
              return (
                <div
                  key={item.id}
                  className="rounded-2xl p-3 flex items-start gap-3"
                  style={{
                    background: "hsl(36,25%,93%)",
                    border: "1px solid hsl(36,20%,86%)",
                    opacity: 0.85,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: colours.bg, color: colours.text }}
                    >
                      {colours.label}
                    </span>
                    <p className="text-sm font-medium leading-snug mt-1.5 line-clamp-2"
                       style={{ color: "hsl(25,15%,30%)" }}>
                      {item.title}
                    </p>
                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "hsl(36,10%,56%)" }}>
                      <Calendar className="w-3 h-3" />
                      {displayDate}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 rounded-xl text-xs font-semibold shrink-0"
                    style={{ borderColor: "hsl(36,20%,78%)", color: "hsl(25,40%,38%)" }}
                    onClick={() => onRestore(item.id)}
                    disabled={isRestorePending}
                    title="Restore this item"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Restore
                  </Button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WinCard({
  achievement,
  index,
  onRequestCoaching,
  isCoachingPending,
  onEdit,
  onDelete,
}: {
  achievement: Achievement;
  index: number;
  onRequestCoaching: () => void;
  isCoachingPending: boolean;
  onEdit: (id: number, title: string, feedbackType: string, achievementDate: string) => void;
  onDelete: (id: number) => void;
}) {
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState(false);
  const [editTitle, setEditTitle]         = useState(achievement.title);
  const [editType, setEditType]           = useState(achievement.feedbackType ?? "win");
  const [editDate, setEditDate]           = useState(achievement.achievementDate ?? format(new Date(), "yyyy-MM-dd"));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeLabel: Record<string, { bg: string; text: string; label: string }> = {
    win:          { bg: "#dcfce7", text: "#166534", label: "Win"      },
    constructive: { bg: "#fef9c3", text: "#854d0e", label: "Feedback" },
    coaching:     { bg: "#dbeafe", text: "#1e40af", label: "Coaching" },
  };
  const colours     = typeLabel[achievement.feedbackType ?? "win"] ?? typeLabel.win;
  const displayDate = achievement.achievementDate
    ? format(new Date(achievement.achievementDate + "T00:00:00"), "MMM d, yyyy")
    : "";

  const handleSaveEdit = () => {
    if (!editTitle.trim()) return;
    onEdit(achievement.id, editTitle.trim(), editType, editDate);
    setEditing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="win-card rounded-2xl p-4"
      style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
    >
      {editing ? (
        /* ── Edit mode ── */
        <div className="space-y-3">
          <Textarea
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="resize-none rounded-xl text-sm h-20"
            style={{ background: "hsl(36,30%,95%)", border: "1px solid hsl(36,20%,84%)" }}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={editType}
              onChange={e => setEditType(e.target.value)}
              className="text-sm rounded-xl px-3 py-2 border"
              style={{ background: "hsl(36,30%,95%)", borderColor: "hsl(36,20%,84%)", color: "hsl(25,20%,16%)" }}
            >
              <option value="win">Win</option>
              <option value="constructive">Feedback</option>
            </select>
            <Input
              type="date"
              value={editDate}
              onChange={e => setEditDate(e.target.value)}
              className="rounded-xl text-sm"
              style={{ background: "hsl(36,30%,95%)", border: "1px solid hsl(36,20%,84%)" }}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs"
              onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" className="rounded-xl h-8 text-xs font-semibold"
              style={{ background: "hsl(25,55%,42%)", color: "white" }}
              onClick={handleSaveEdit}>
              <Check className="w-3 h-3 mr-1" />Save
            </Button>
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: colours.bg, color: colours.text }}
                >
                  {colours.label}
                </span>
                {achievement.fromPerson && (
                  <span className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>
                    from {achievement.fromPerson}
                  </span>
                )}
              </div>
              <p className="font-medium text-sm leading-snug" style={{ color: "hsl(25,20%,16%)" }}>
                {achievement.title}
              </p>
              <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "hsl(36,10%,56%)" }}>
                <Calendar className="w-3 h-3" />
                {displayDate}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {!achievement.coachingResponse && (
                <Button
                  size="sm" variant="outline"
                  className="h-8 px-3 rounded-xl text-xs font-semibold"
                  style={{ borderColor: "hsl(36,20%,82%)", color: "hsl(36,10%,42%)" }}
                  onClick={onRequestCoaching}
                  disabled={isCoachingPending}
                >
                  {isCoachingPending
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <><Sparkles className="w-3 h-3 mr-1" />Coach</>}
                </Button>
              )}
              <Button
                size="sm" variant="ghost"
                className="h-8 w-8 p-0 rounded-xl"
                style={{ color: "hsl(36,10%,52%)" }}
                onClick={() => { setEditTitle(achievement.title); setEditType(achievement.feedbackType ?? "win"); setEditDate(achievement.achievementDate ?? ""); setEditing(true); }}
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-8 px-2 rounded-xl text-xs"
                    style={{ color: "#dc2626", background: "#fee2e2" }}
                    onClick={() => { onDelete(achievement.id); setConfirmDelete(false); }}>
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-xl text-xs"
                    onClick={() => setConfirmDelete(false)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm" variant="ghost"
                  className="h-8 w-8 p-0 rounded-xl"
                  style={{ color: "hsl(36,10%,62%)" }}
                  onClick={() => setConfirmDelete(true)}
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {achievement.coachingResponse && (
            <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
              <CollapsibleTrigger asChild>
                <button
                  className="w-full flex items-center justify-between text-xs font-semibold px-3 py-2 rounded-xl"
                  style={{ background: "hsl(36,20%,92%)", color: "hsl(25,40%,35%)" }}
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> AI Coach Notes
                  </span>
                  {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div
                  className="mt-2 p-3 rounded-xl text-xs leading-relaxed"
                  style={{ background: "hsl(36,30%,94%)", color: "hsl(25,20%,25%)" }}
                >
                  {achievement.coachingResponse}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </motion.div>
  );
}

function LogWinForm({ onSubmit, isPending }: { onSubmit: (data: InsertAchievement) => void; isPending: boolean }) {
  const [selectedGoalIds, setSelectedGoalIds] = useState<number[]>([]);
  const form = useForm<InsertAchievement>({
    resolver: zodResolver(insertAchievementSchema),
    defaultValues: {
      title: "",
      achievementDate: format(new Date(), "yyyy-MM-dd"),
      feedbackType: "win",
      source: "self",
    },
  });

  const handleSubmit = async (data: InsertAchievement) => {
    onSubmit(data);
    form.reset({ title: "", achievementDate: format(new Date(), "yyyy-MM-dd"), feedbackType: "win", source: "self" });
    setSelectedGoalIds([]);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="Describe the win or feedback…"
                  className="resize-none rounded-xl text-sm h-20"
                  style={{ background: "hsl(36,30%,95%)", border: "1px solid hsl(36,20%,84%)" }}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="feedbackType"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold" style={{ color: "hsl(36,10%,48%)" }}>Type</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    value={field.value ?? "win"}
                    className="w-full h-9 px-3 rounded-xl text-sm font-medium border"
                    style={{
                      background: "hsl(36,30%,95%)",
                      border: "1px solid hsl(36,20%,84%)",
                      color: "hsl(25,20%,20%)",
                    }}
                  >
                    <option value="win">Win ⭐</option>
                    <option value="constructive">Feedback 💬</option>
                    <option value="coaching">Coaching 🎯</option>
                  </select>
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="achievementDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold" style={{ color: "hsl(36,10%,48%)" }}>Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    className="h-9 rounded-xl text-sm"
                    style={{ background: "hsl(36,30%,95%)", border: "1px solid hsl(36,20%,84%)" }}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="fromPerson"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="From (optional — e.g. your manager)"
                  className="h-9 rounded-xl text-sm"
                  style={{ background: "hsl(36,30%,95%)", border: "1px solid hsl(36,20%,84%)" }}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <div className="border-t" style={{ borderColor: "hsl(36,20%,88%)" }}></div>
        <GoalSelector selectedGoalIds={selectedGoalIds} onChange={setSelectedGoalIds} />
        <Button
          type="submit"
          className="w-full h-10 rounded-xl font-semibold"
          style={{ background: "hsl(25,55%,42%)", color: "white" }}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          Save
        </Button>
      </form>
    </Form>
  );
}

// ─── Tab: Self Review ────────────────────────────────────────────────────────
type ReviewMode = "idle" | "draft";
type SaveStatus = "idle" | "saving" | "saved" | "error";

function ReviewTab({ confirmedWins }: { confirmedWins: Achievement[] }) {
  const [period, setPeriod]             = useState<"3m" | "6m" | "1y">(() => {
    // Persist period selection across sessions
    return (localStorage.getItem("winsync_review_period") as "3m" | "6m" | "1y") ?? "3m";
  });
  const [mode, setMode]                 = useState<ReviewMode>("idle");
  const [draft, setDraft]               = useState("");
  const [draftSource, setDraftSource]   = useState<"ai" | "scratch">("ai");
  const [generating, setGenerating]     = useState(false);
  const [polishing, setPolishing]       = useState(false);
  const [copied, setCopied]             = useState(false);
  const [saveStatus, setSaveStatus]     = useState<SaveStatus>("idle");
  const [draftLoaded, setDraftLoaded]   = useState(false);
  const saveTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast }                       = useToast();

  const periodLabels = { "3m": "Last 3 months", "6m": "Last 6 months", "1y": "Last year" };
  const periodDays   = { "3m": 90, "6m": 180, "1y": 365 };

  // Load saved draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const res = await fetch("/api/review/saved-draft");
        if (!res.ok) return;
        const data = await res.json();
        if (data.content && data.content.trim()) {
          setDraft(data.content);
          setDraftSource("ai");
          setMode("draft");
        }
      } catch {
        // silently fail — draft is optional
      } finally {
        setDraftLoaded(true);
      }
    };
    loadDraft();
  }, []);

  // Auto-save with 1.5s debounce whenever draft changes (after initial load)
  const triggerAutoSave = useCallback((content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch("/api/review/saved-draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2500);
      } catch {
        setSaveStatus("error");
      }
    }, 1500);
  }, []);

  const handleDraftChange = (newValue: string) => {
    setDraft(newValue);
    if (draftLoaded) triggerAutoSave(newValue);
  };

  const filteredWins = confirmedWins.filter(a => {
    if (!a.achievementDate) return true;
    const date   = new Date(a.achievementDate + "T00:00:00");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays[period]);
    return date >= cutoff;
  });

  const winTitles = filteredWins.map(w => w.title);

  const handlePeriodChange = (p: "3m" | "6m" | "1y") => {
    setPeriod(p);
    localStorage.setItem("winsync_review_period", p);
  };

  // Generate a fresh AI draft from wins
  const generateDraft = async () => {
    if (filteredWins.length === 0) {
      toast({ variant: "destructive", title: "No wins yet", description: "Log some wins first, then generate your review." });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/review/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wins: winTitles, periodLabel: periodLabels[period] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Generation failed");
      setDraft(data.draft);
      setDraftSource("ai");
      setMode("draft");
      triggerAutoSave(data.draft);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setGenerating(false);
    }
  };

  // Polish whatever is in the textarea with AI
  const polishWithAI = async () => {
    if (!draft.trim()) {
      toast({ variant: "destructive", title: "Nothing to polish", description: "Write something first." });
      return;
    }
    setPolishing(true);
    try {
      const res = await fetch("/api/review/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wins: winTitles, periodLabel: periodLabels[period], existingDraft: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Polish failed");
      setDraft(data.draft);
      triggerAutoSave(data.draft);
      toast({ title: "✨ Polished!", description: "AI improved your draft." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setPolishing(false);
    }
  };

  const startFromScratch = () => {
    setDraft("");
    setDraftSource("scratch");
    setMode("draft");
  };

  const clearDraft = async () => {
    setDraft("");
    setMode("idle");
    // Clear saved draft on server too
    try {
      await fetch("/api/review/saved-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
      });
    } catch { /* ignore */ }
    setSaveStatus("idle");
  };

  const copyDraft = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveIndicator = saveStatus === "saving"
    ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Saving…</span>
    : saveStatus === "saved"
    ? <span className="flex items-center gap-1 text-green-600"><Check className="w-3 h-3" />Saved</span>
    : saveStatus === "error"
    ? <span className="text-red-500">Save failed</span>
    : null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="mt-2 mb-5">
        <h2 className="text-2xl font-display font-bold" style={{ color: "hsl(25,20%,16%)" }}>Self Review</h2>
        <p className="text-sm mt-1" style={{ color: "hsl(36,10%,50%)" }}>
          Turn your logged wins into a performance review draft.
        </p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-5">
        {(["3m", "6m", "1y"] as const).map(p => (
          <button
            key={p}
            onClick={() => handlePeriodChange(p)}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={{
              background: period === p ? "hsl(25,55%,42%)" : "hsl(36,20%,90%)",
              color:      period === p ? "white"            : "hsl(36,10%,42%)",
            }}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* Win count summary */}
      <div
        className="rounded-2xl p-4 mb-5 flex items-center gap-3"
        style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
      >
        <span className="text-3xl">📋</span>
        <div>
          <p className="font-display font-bold text-lg" style={{ color: "hsl(25,20%,16%)" }}>
            {filteredWins.length} win{filteredWins.length !== 1 ? "s" : ""} in this period
          </p>
          <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>
            {filteredWins.filter(w => w.feedbackType === "win").length} wins ·{" "}
            {filteredWins.filter(w => w.feedbackType === "constructive").length} feedback ·{" "}
            {filteredWins.filter(w => w.coachingResponse).length} with coaching
          </p>
        </div>
      </div>

      {/* ── IDLE: no draft yet ─────────────────────────────────────────────────── */}
      {mode === "idle" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Button
            className="w-full h-12 rounded-2xl font-semibold text-base mb-3"
            style={{ background: "hsl(25,55%,42%)", color: "white" }}
            onClick={generateDraft}
            disabled={generating}
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating draft…</>
              : <><Sparkles className="w-4 h-4 mr-2" />Generate with AI</>}
          </Button>

          <button
            className="w-full h-10 rounded-2xl text-sm font-semibold"
            style={{ background: "hsl(36,20%,91%)", color: "hsl(25,20%,35%)" }}
            onClick={startFromScratch}
          >
            ✏️ Write from scratch
          </button>

          <p className="text-center text-xs mt-3" style={{ color: "hsl(36,10%,55%)" }}>
            AI uses your logged wins · You can edit freely after
          </p>
        </motion.div>
      )}

      {/* ── DRAFT: editing mode ────────────────────────────────────────────────── */}
      {mode === "draft" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(36,20%,88%)" }}>

            {/* Toolbar */}
            <div
              className="flex items-center justify-between px-4 py-2.5 gap-2 flex-wrap"
              style={{ background: "hsl(36,25%,94%)", borderBottom: "1px solid hsl(36,20%,88%)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: "hsl(25,20%,30%)" }}>
                  {draftSource === "ai" ? "✦ AI Draft" : "✏️ Your Draft"} · {periodLabels[period]}
                </span>
                <span className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>{saveIndicator}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={polishWithAI}
                  disabled={polishing}
                  className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: "hsl(25,55%,42%)", color: "white" }}
                >
                  {polishing
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Polishing…</>
                    : <><Sparkles className="w-3 h-3" /> Polish with AI</>}
                </button>
                {draftSource === "ai" && (
                  <button
                    onClick={generateDraft}
                    disabled={generating}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "hsl(36,20%,87%)", color: "hsl(25,30%,30%)" }}
                  >
                    {generating
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Regenerating…</>
                      : <>↺ Regenerate</>}
                  </button>
                )}
                <button
                  onClick={copyDraft}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: "hsl(36,20%,87%)", color: "hsl(25,30%,30%)" }}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <button
                  onClick={clearDraft}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: "transparent", color: "hsl(36,10%,55%)" }}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Editable textarea */}
            <textarea
              value={draft}
              onChange={e => handleDraftChange(e.target.value)}
              placeholder={draftSource === "scratch"
                ? "Start writing your self-review here…\n\nTip: Use 'Polish with AI' when you're ready to improve it."
                : ""}
              rows={20}
              className="w-full p-4 text-sm leading-relaxed resize-none outline-none"
              style={{
                background: "hsl(36,40%,98%)",
                color: "hsl(25,20%,18%)",
                fontFamily: "inherit",
                minHeight: "320px",
              }}
            />

            {/* Footer hint */}
            <div
              className="px-4 py-2 text-xs flex items-center gap-1"
              style={{
                background: "hsl(36,25%,94%)",
                borderTop: "1px solid hsl(36,20%,88%)",
                color: "hsl(36,10%,55%)",
              }}
            >
              <Clock className="w-3 h-3" />
              Auto-saved across devices · Polish with AI · Copy to take it elsewhere
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Tab: Settings ───────────────────────────────────────────────────────────
function SettingsTab({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [wedEnabled, setWedEnabled] = useState(true);
  const [friEnabled, setFriEnabled] = useState(true);
  const [emailInput, setEmailInput] = useState<string>(user.email ?? "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved]   = useState(false);
  const [weeklyReminder, setWeeklyReminder] = useState<boolean>(user.weeklyReminder ?? false);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleWeeklyReminder = async (enabled: boolean) => {
    setReminderSaving(true);
    try {
      const res = await fetch("/api/user/weekly-reminder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update");
      setWeeklyReminder(enabled);
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: enabled ? "Reminders on!" : "Reminders off", description: enabled ? "You'll get a recap every Monday morning." : "Weekly reminders disabled." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setReminderSaving(false);
    }
  };

  const sendTestReminder = async () => {
    setTestSending(true);
    try {
      const res = await fetch("/api/user/test-reminder", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast({ title: "Test email sent!", description: "Check your inbox." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setTestSending(false);
    }
  };

  const saveEmail = async () => {
    if (!emailInput.trim() || !emailInput.includes("@")) {
      toast({ variant: "destructive", title: "Invalid email", description: "Enter a valid email address." });
      return;
    }
    setSavingEmail(true);
    try {
      const res = await fetch("/api/user/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setEmailSaved(true);
      toast({ title: "Email saved!", description: "Gmail captures will now be matched to your account." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save email." });
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="mt-2 mb-5">
        <h2 className="text-2xl font-display font-bold" style={{ color: "hsl(25,20%,16%)" }}>Settings</h2>
      </div>

      {/* Profile */}
      <section className="mb-6">
        <div
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg"
            style={{ background: "hsl(25,55%,42%)", color: "white" }}
          >
            {(user.username ?? "U")[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: "hsl(25,20%,16%)" }}>@{user.username}</p>
            <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>
              Level {user.level ?? 1} · {user.xp ?? 0} XP total
            </p>
          </div>
        </div>
      </section>

      {/* ── Career Profile ─────────────────────────────────────────── */}
      <ProfileSection user={user} />

      {/* ── Gmail capture ─────────────────────────────────────────── */}
      <section className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "hsl(36,10%,52%)" }}>
          Gmail Capture
        </h3>
        <div
          className="rounded-2xl p-4"
          style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: "hsl(25,20%,20%)" }}>
            Your Gmail address
          </p>
          <p className="text-xs mb-3" style={{ color: "hsl(36,10%,52%)" }}>
            Save your Gmail so wins captured by the script get matched to your account.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={e => { setEmailInput(e.target.value); setEmailSaved(false); }}
              placeholder="you@gmail.com"
              className="flex-1 h-9 px-3 rounded-xl text-sm outline-none"
              style={{
                background: "hsl(36,30%,94%)",
                border: "1px solid hsl(36,20%,84%)",
                color: "hsl(25,20%,16%)",
              }}
            />
            <Button
              className="h-9 px-4 rounded-xl text-xs font-semibold shrink-0"
              style={{ background: "hsl(25,55%,42%)", color: "white" }}
              onClick={saveEmail}
              disabled={savingEmail}
            >
              {savingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : emailSaved ? "Saved ✓" : "Save"}
            </Button>
          </div>

          <div className="mt-4 p-3 rounded-xl" style={{ background: "hsl(36,25%,92%)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "hsl(25,30%,30%)" }}>
              How to capture a win from Gmail
            </p>
            <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>
              Open the email in Gmail → click the label icon → apply the label{" "}
              <code className="font-mono font-bold">winsync</code>.
              The Google Apps Script will pick it up within 15 minutes and it'll appear in This Week.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {[
            { n: "1", text: "Save your Gmail address above" },
            { n: "2", text: "In Gmail, find an email with a win or feedback" },
            { n: "3", text: 'Label it "winsync"' },
            { n: "4", text: "It appears in This Week within 15 minutes" },
          ].map(s => (
            <div key={s.n} className="flex items-center gap-3">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: "hsl(25,55%,42%)", color: "white" }}
              >
                {s.n}
              </span>
              <p className="text-xs" style={{ color: "hsl(36,10%,48%)" }}>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Digest schedule */}
      <section className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "hsl(36,10%,52%)" }}>
          Digest Schedule
        </h3>
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(36,20%,88%)" }}>
          {[
            { label: "Wednesday digest", desc: "Midweek check-in",    value: wedEnabled, toggle: () => setWedEnabled(v => !v) },
            { label: "Friday digest",    desc: "End-of-week wrap-up", value: friEnabled, toggle: () => setFriEnabled(v => !v) },
          ].map((row, i) => (
            <div
              key={row.label}
              className="flex items-center justify-between p-4"
              style={{
                background: "hsl(36,40%,98%)",
                borderBottom: i === 0 ? "1px solid hsl(36,20%,90%)" : "none",
              }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: "hsl(25,20%,16%)" }}>{row.label}</p>
                <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>{row.desc}</p>
              </div>
              <ToggleSwitch value={row.value} onChange={row.toggle} />
            </div>
          ))}
        </div>
      </section>

      {/* Weekly Reminder */}
      <section className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "hsl(36,10%,52%)" }}>
          Weekly Reminder
        </h3>
        <div
          className="rounded-2xl p-4"
          style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: "hsl(25,20%,16%)" }}>Monday morning recap</p>
              <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>
                A quick email every Monday with your weekly win count
              </p>
            </div>
            <ToggleSwitch
              value={weeklyReminder}
              onChange={() => !reminderSaving && toggleWeeklyReminder(!weeklyReminder)}
            />
          </div>
          {weeklyReminder && user.email && (
            <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid hsl(36,20%,90%)" }}>
              <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>
                Sends to: <span className="font-medium">{user.email}</span>
              </p>
              <Button
                className="h-7 px-3 rounded-xl text-xs font-semibold"
                style={{ background: "hsl(36,25%,90%)", color: "hsl(25,20%,30%)" }}
                onClick={sendTestReminder}
                disabled={testSending}
              >
                {testSending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send test"}
              </Button>
            </div>
          )}
          {!user.email && (
            <p className="text-xs mt-2 p-2 rounded-xl" style={{ background: "hsl(36,30%,93%)", color: "hsl(25,30%,40%)" }}>
              ⚠️ Save your email address above to enable reminders.
            </p>
          )}
        </div>
      </section>

      {/* Privacy */}
      <section className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "hsl(36,10%,52%)" }}>
          Privacy
        </h3>
        <div
          className="rounded-2xl p-4 flex items-center justify-between"
          style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "hsl(25,20%,16%)" }}>End-to-end encryption</p>
            <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>Your wins are encrypted at rest</p>
          </div>
          <span className="text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded-full">Active ✓</span>
        </div>
      </section>

      {/* Past Reviews */}
      <section className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "hsl(36,10%,52%)" }}>
          Review History
        </h3>
        <a
          href="/past-reviews"
          className="flex items-center gap-3 rounded-2xl p-4 w-full"
          style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
        >
          <BookOpen className="w-5 h-5 shrink-0" style={{ color: "hsl(25,40%,45%)" }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "hsl(25,20%,16%)" }}>Past Reviews</p>
            <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>Browse archived seasons and past review drafts</p>
          </div>
          <ChevronDown className="w-4 h-4 -rotate-90" style={{ color: "hsl(36,10%,52%)" }} />
        </a>
      </section>

      {/* Sign out */}
      <Button
        variant="outline"
        className="w-full h-11 rounded-2xl font-semibold"
        style={{ borderColor: "hsl(36,20%,82%)", color: "hsl(25,20%,35%)" }}
        onClick={onLogout}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </Button>

      <p className="text-center text-xs mt-6 mb-2" style={{ color: "hsl(36,10%,60%)" }}>
        Winsync · v1.0
      </p>
    </motion.div>
  );
}

// ─── How it works modal ───────────────────────────────────────────────────────
function HowItWorksModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps = [
    {
      emoji: "📅",
      title: "This Week — your capture inbox",
      desc: "Log wins and feedback on the fly by typing them in and pressing Enter. Once you connect Gmail or Slack, suggestions from your real work appear here every Wednesday and Friday to confirm or dismiss.",
    },
    {
      emoji: "🏆",
      title: "My Wins — your career story",
      desc: "All your confirmed wins in one place. Filter by type, edit anything, request AI coaching, or tag wins to your goals. Dismissed items are never deleted — they sit in a recoverable section at the bottom.",
    },
    {
      emoji: "🎯",
      title: "Goals — stay on track",
      desc: "Set 3–5 goals for the year (e.g. 'Get promoted', 'Ship new product line'). Tag each win to the goals it supports. If you haven't logged progress on a goal in 60+ days, you'll get a nudge on the My Wins tab.",
    },
    {
      emoji: "✦",
      title: "Self Review — never start from scratch",
      desc: "Your draft auto-saves across devices as you write. When you're ready, hit Generate to turn your wins into a first-draft self-review, then polish it with AI or edit it yourself. Copy and paste it wherever you need it.",
    },
    {
      emoji: "📦",
      title: "Wrap up a season — start fresh anytime",
      desc: "When a review cycle ends, hit 'Wrap up this season' in My Wins. Name the season, choose what to do with your goals, and everything gets archived to Past Reviews. You start completely fresh.",
    },
    {
      emoji: "⚙️",
      title: "Settings — personalise your experience",
      desc: "Fill in your Career Profile (role, team, career goal) to help the app tailor itself to you. Save your email to get weekly Monday recap emails. The more context you give, the more useful Winsync becomes.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-sm rounded-3xl p-0 overflow-hidden"
        style={{ background: "hsl(36,33%,96%)", border: "1px solid hsl(36,20%,86%)" }}
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">⚡</span>
            <DialogTitle className="text-xl font-display font-bold" style={{ color: "hsl(25,20%,16%)" }}>
              How Winsync works
            </DialogTitle>
          </div>
          <p className="text-sm" style={{ color: "hsl(36,10%,50%)" }}>
            Six things to know before you dive in.
          </p>
        </DialogHeader>

        <div className="px-6 pb-2 space-y-4 max-h-[60vh] overflow-y-auto">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div
                className="flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 text-lg"
                style={{ background: "hsl(36,30%,92%)" }}
              >
                {s.emoji}
              </div>
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: "hsl(25,20%,16%)" }}>
                  {s.title}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "hsl(36,10%,48%)" }}>
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          <Button
            className="w-full h-11 rounded-2xl font-semibold text-sm"
            style={{ background: "hsl(25,55%,42%)", color: "white" }}
            onClick={onClose}
          >
            Got it, let's go ⚡
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Wrap up season modal ─────────────────────────────────────────────────────
function WrapUpModal({
  open,
  onClose,
  onConfirm,
  isWrapping,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string, archiveGoals: boolean) => void;
  isWrapping: boolean;
}) {
  const defaultName = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const [name, setName] = useState(defaultName);
  const [step, setStep] = useState<"name" | "goals">("name");
  const [archiveGoals, setArchiveGoals] = useState<boolean | null>(null);

  // Reset state each time modal opens
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setStep("name");
      setArchiveGoals(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isWrapping && onClose()}>
      <DialogContent
        className="max-w-sm rounded-3xl p-0 overflow-hidden"
        style={{ background: "hsl(36,33%,96%)", border: "1px solid hsl(36,20%,86%)" }}
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📦</span>
            <DialogTitle className="text-xl font-display font-bold" style={{ color: "hsl(25,20%,16%)" }}>
              {step === "name" ? "Wrap up this season" : "What about your goals?"}
            </DialogTitle>
          </div>
          <p className="text-sm" style={{ color: "hsl(36,10%,50%)" }}>
            {step === "name"
              ? "Give this review season a name. All your current wins and saved review draft will be archived together."
              : "Decide what happens to your current goals when you start fresh."}
          </p>
        </DialogHeader>

        {step === "name" ? (
          <>
            <div className="px-6 pb-2 space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "hsl(36,10%,52%)" }}>
                  Season name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. 2025 Annual Review"
                  className="w-full h-10 px-3 rounded-xl text-sm outline-none"
                  style={{
                    background: "hsl(36,30%,94%)",
                    border: "1px solid hsl(36,20%,84%)",
                    color: "hsl(25,20%,16%)",
                  }}
                />
              </div>
              <div
                className="rounded-xl p-3 text-xs"
                style={{ background: "hsl(36,30%,92%)", color: "hsl(25,20%,35%)" }}
              >
                ⚠️ This will move all your current wins to Past Reviews and clear your draft. Nothing is deleted — you can always go to Past Reviews to read them.
              </div>
            </div>
            <div className="px-6 pb-6 pt-3 flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-2xl font-semibold"
                style={{ borderColor: "hsl(36,20%,82%)", color: "hsl(25,20%,35%)" }}
                onClick={onClose}
                disabled={isWrapping}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-11 rounded-2xl font-semibold"
                style={{ background: "hsl(25,55%,42%)", color: "white" }}
                onClick={() => name.trim() && setStep("goals")}
                disabled={!name.trim()}
              >
                Next →
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 pb-2 space-y-3">
              {[
                {
                  value: false,
                  emoji: "🔄",
                  label: "Keep my goals",
                  desc: "Carry them over into the new season — good if you're continuing the same objectives.",
                },
                {
                  value: true,
                  emoji: "📁",
                  label: "Archive my goals",
                  desc: "Store them with this season and start fresh — good if your goals are changing.",
                },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => setArchiveGoals(opt.value)}
                  className="w-full rounded-xl p-4 text-left transition-all"
                  style={{
                    background: archiveGoals === opt.value ? "hsl(25,55%,42%)" : "hsl(36,30%,94%)",
                    border: archiveGoals === opt.value ? "2px solid hsl(25,55%,42%)" : "2px solid hsl(36,20%,84%)",
                    color: archiveGoals === opt.value ? "white" : "hsl(25,20%,16%)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{opt.emoji}</span>
                    <span className="font-semibold text-sm">{opt.label}</span>
                  </div>
                  <p className="text-xs ml-7" style={{ color: archiveGoals === opt.value ? "rgba(255,255,255,0.8)" : "hsl(36,10%,52%)" }}>
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
            <div className="px-6 pb-6 pt-3 flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-2xl font-semibold"
                style={{ borderColor: "hsl(36,20%,82%)", color: "hsl(25,20%,35%)" }}
                onClick={() => setStep("name")}
                disabled={isWrapping}
              >
                ← Back
              </Button>
              <Button
                className="flex-1 h-11 rounded-2xl font-semibold"
                style={{ background: "hsl(25,55%,42%)", color: "white" }}
                onClick={() => archiveGoals !== null && onConfirm(name.trim(), archiveGoals)}
                disabled={isWrapping || archiveGoals === null}
              >
                {isWrapping
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Archiving…</>
                  : <>📦 Archive & start fresh</>}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Career Profile Section ───────────────────────────────────────────────────
function ProfileSection({ user }: { user: any }) {
  const [role, setRole] = useState<string>(user.role ?? "");
  const [careerJourney, setCareerJourney] = useState<string>(user.careerJourney ?? "");
  const [team, setTeam] = useState<string>(user.team ?? "");
  const [company, setCompany] = useState<string>(user.company ?? "");
  const [profileContext, setProfileContext] = useState<string>(user.profileContext ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: role || undefined, careerJourney: careerJourney || undefined, team: team || undefined, company: company || undefined, profileContext: profileContext || undefined }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: "Profile updated!", description: "Your career context has been saved." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const journeyOptions = [
    { value: "Promotion in current role", label: "Aiming for promotion" },
    { value: "New job", label: "Looking for a new job" },
    { value: "Learning & growth", label: "Staying in role, leveling up" },
  ];

  return (
    <section className="mb-6">
      <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "hsl(36,10%,52%)" }}>
        Career Profile
      </h3>
      <div
        className="rounded-2xl p-4"
        style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
      >
        <p className="text-xs mb-3" style={{ color: "hsl(36,10%,52%)" }}>
          Complete your profile so the app can personalize your experience. All fields are optional.
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "hsl(25,20%,16%)" }}>
              Current Role
            </label>
            <input
              type="text"
              value={role}
              onChange={e => { setRole(e.target.value); setSaved(false); }}
              placeholder="e.g. Senior Software Engineer"
              className="w-full h-9 px-3 rounded-xl text-sm outline-none"
              style={{
                background: "hsl(36,30%,94%)",
                border: "1px solid hsl(36,20%,84%)",
                color: "hsl(25,20%,16%)",
              }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "hsl(25,20%,16%)" }}>
              Career Journey
            </label>
            <select
              value={careerJourney}
              onChange={e => { setCareerJourney(e.target.value); setSaved(false); }}
              className="w-full h-9 px-3 rounded-xl text-sm outline-none"
              style={{
                background: "hsl(36,30%,94%)",
                border: "1px solid hsl(36,20%,84%)",
                color: "hsl(25,20%,16%)",
              }}
            >
              <option value="">Select your path...</option>
              {journeyOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "hsl(25,20%,16%)" }}>
                Team
              </label>
              <input
                type="text"
                value={team}
                onChange={e => { setTeam(e.target.value); setSaved(false); }}
                placeholder="e.g. Platform"
                className="w-full h-9 px-3 rounded-xl text-sm outline-none"
                style={{
                  background: "hsl(36,30%,94%)",
                  border: "1px solid hsl(36,20%,84%)",
                  color: "hsl(25,20%,16%)",
                }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "hsl(25,20%,16%)" }}>
                Company
              </label>
              <input
                type="text"
                value={company}
                onChange={e => { setCompany(e.target.value); setSaved(false); }}
                placeholder="e.g. Acme Corp"
                className="w-full h-9 px-3 rounded-xl text-sm outline-none"
                style={{
                  background: "hsl(36,30%,94%)",
                  border: "1px solid hsl(36,20%,84%)",
                  color: "hsl(25,20%,16%)",
                }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "hsl(25,20%,16%)" }}>
              Other Context
            </label>
            <textarea
              value={profileContext}
              onChange={e => { setProfileContext(e.target.value); setSaved(false); }}
              placeholder="e.g. Skills you're developing, certifications, anything else..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={{
                background: "hsl(36,30%,94%)",
                border: "1px solid hsl(36,20%,84%)",
                color: "hsl(25,20%,16%)",
              }}
            />
          </div>
        </div>

        <Button
          className="w-full h-9 rounded-xl text-sm font-semibold"
          style={{ background: "hsl(25,55%,42%)", color: "white" }}
          onClick={saveProfile}
          disabled={saving}
        >
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Saving...</> : saved ? "Saved ✓" : "Save Profile"}
        </Button>
      </div>
    </section>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function ToggleSwitch({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="w-11 h-6 rounded-full relative transition-colors"
      style={{ background: value ? "hsl(25,55%,42%)" : "hsl(36,20%,80%)" }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: value ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}
