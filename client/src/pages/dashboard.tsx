import { useState, useEffect } from "react";
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
  LogOut, Plus, Calendar, Loader2, CheckCircle2, X, ChevronDown, ChevronUp, Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
    requestCoaching,
  } = useAchievements();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("digest");

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
          <span className="text-2xl">🧭</span>
          <span className="font-display font-bold text-lg" style={{ color: "hsl(25,20%,16%)" }}>
            Career Compass
          </span>
        </div>
        <div
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
          style={{ background: "hsl(36,20%,88%)", color: "hsl(25,40%,35%)" }}
        >
          ⭐ {user.xp ?? 0} XP · Lv {user.level ?? 1}
        </div>
      </header>

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
}: {
  pendingItems: Achievement[];
  isLoading: boolean;
  onConfirm: (id: number) => void;
  onDismiss: (id: number) => void;
  isConfirmPending: boolean;
  isDismissPending: boolean;
}) {
  const today     = new Date();
  const weekOf    = format(today, "MMM d");
  const dow       = today.getDay();
  let nextDigest  = "";
  if (dow < 3)      nextDigest = "Wednesday";
  else if (dow === 3) nextDigest = "today (Wednesday)";
  else if (dow < 5) nextDigest = "Friday";
  else              nextDigest = "next Wednesday";

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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "hsl(36,20%,90%)" }} />
          ))}
        </div>
      ) : pendingItems.length === 0 ? (
        <EmptyDigest />
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium mb-2" style={{ color: "hsl(36,10%,48%)" }}>
            {pendingItems.length} item{pendingItems.length !== 1 ? "s" : ""} waiting for review
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
        className="mt-6 p-4 rounded-2xl flex gap-3 items-start"
        style={{ background: "hsl(36,30%,91%)", border: "1px solid hsl(36,20%,84%)" }}
      >
        <span className="text-xl">💡</span>
        <div>
          <p className="text-sm font-semibold" style={{ color: "hsl(25,20%,20%)" }}>How digests work</p>
          <p className="text-xs mt-0.5" style={{ color: "hsl(36,10%,48%)" }}>
            Every Wednesday and Friday, Career Compass surfaces wins and feedback from your connected
            tools. Confirm items to add them to My Wins, or dismiss ones that aren't relevant.
            Connect Gmail or Slack in Settings to enable auto-capture.
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
}: {
  confirmedWins: Achievement[];
  isLoading: boolean;
  onAdd: (data: InsertAchievement) => void;
  isAddPending: boolean;
  onRequestCoaching: (id: number) => void;
  isCoachingPending: boolean;
  coachingVariable: number | undefined;
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
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

function WinCard({
  achievement,
  index,
  onRequestCoaching,
  isCoachingPending,
}: {
  achievement: Achievement;
  index: number;
  onRequestCoaching: () => void;
  isCoachingPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const typeLabel: Record<string, { bg: string; text: string; label: string }> = {
    win:          { bg: "#dcfce7", text: "#166534", label: "Win"      },
    constructive: { bg: "#fef9c3", text: "#854d0e", label: "Feedback" },
    coaching:     { bg: "#dbeafe", text: "#1e40af", label: "Coaching" },
  };
  const colours    = typeLabel[achievement.feedbackType ?? "win"] ?? typeLabel.win;
  const displayDate = achievement.achievementDate
    ? format(new Date(achievement.achievementDate + "T00:00:00"), "MMM d, yyyy")
    : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="win-card rounded-2xl p-4"
      style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
    >
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
        {!achievement.coachingResponse && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 h-8 px-3 rounded-xl text-xs font-semibold"
            style={{ borderColor: "hsl(36,20%,82%)", color: "hsl(36,10%,42%)" }}
            onClick={onRequestCoaching}
            disabled={isCoachingPending}
          >
            {isCoachingPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <><Sparkles className="w-3 h-3 mr-1" />Coach</>}
          </Button>
        )}
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
    </motion.div>
  );
}

function LogWinForm({ onSubmit, isPending }: { onSubmit: (data: InsertAchievement) => void; isPending: boolean }) {
  const form = useForm<InsertAchievement>({
    resolver: zodResolver(insertAchievementSchema),
    defaultValues: {
      title: "",
      achievementDate: format(new Date(), "yyyy-MM-dd"),
      feedbackType: "win",
      source: "self",
    },
  });

  const handleSubmit = (data: InsertAchievement) => {
    onSubmit(data);
    form.reset({ title: "", achievementDate: format(new Date(), "yyyy-MM-dd"), feedbackType: "win", source: "self" });
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
function ReviewTab({ confirmedWins }: { confirmedWins: Achievement[] }) {
  const [period, setPeriod]   = useState<"3m" | "6m" | "1y">("3m");
  const [draft, setDraft]     = useState("");
  const [generating, setGenerating] = useState(false);
  const { toast }             = useToast();

  const periodLabels = { "3m": "Last 3 months", "6m": "Last 6 months", "1y": "Last year" };
  const periodDays   = { "3m": 90, "6m": 180, "1y": 365 };

  const filteredWins = confirmedWins.filter(a => {
    if (!a.achievementDate) return true;
    const date   = new Date(a.achievementDate + "T00:00:00");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays[period]);
    return date >= cutoff;
  });

  const generateDraft = async () => {
    if (filteredWins.length === 0) {
      toast({ variant: "destructive", title: "No wins yet", description: "Log some wins first, then generate your review." });
      return;
    }
    setGenerating(true);
    await new Promise(r => setTimeout(r, 1200));

    const winsList = filteredWins.map((w, i) => `${i + 1}. ${w.title}`).join("\n");
    const generated = `SELF-REVIEW DRAFT — ${periodLabels[period].toUpperCase()}
Generated ${format(new Date(), "MMMM d, yyyy")}

KEY ACCOMPLISHMENTS
──────────────────
${winsList}

IMPACT & VALUE DELIVERED
────────────────────────
Over the ${periodLabels[period].toLowerCase()}, I contributed across ${filteredWins.length} documented wins spanning wins, feedback, and growth moments.

[Tip: personalise each bullet with specific metrics, team names, or business outcomes before submitting.]

AREAS OF GROWTH
───────────────
${filteredWins.filter(w => w.feedbackType === "constructive").length > 0
  ? "I actively sought and acted on constructive feedback to improve in key areas."
  : "I focused on delivering consistent wins and will seek more feedback next cycle."}

GOALS FOR NEXT PERIOD
──────────────────────
• Continue capturing wins regularly via Career Compass digests
• Build deeper impact stories around top 3 accomplishments above
• [Add your own goal here]
`;
    setDraft(generated);
    setGenerating(false);
  };

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
            onClick={() => setPeriod(p)}
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

      {/* Win count */}
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

      {/* Generate button */}
      <Button
        className="w-full h-12 rounded-2xl font-semibold text-base mb-5"
        style={{ background: "hsl(25,55%,42%)", color: "white" }}
        onClick={generateDraft}
        disabled={generating}
      >
        {generating
          ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating draft…</>
          : <><Sparkles className="w-4 h-4 mr-2" />Generate Review Draft</>}
      </Button>

      {/* Draft output */}
      {draft && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div
            className="rounded-2xl p-4"
            style={{ background: "hsl(36,40%,98%)", border: "1px solid hsl(36,20%,88%)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm" style={{ color: "hsl(25,20%,20%)" }}>
                Your Draft
              </h3>
              <button
                onClick={() => navigator.clipboard.writeText(draft)}
                className="text-xs font-semibold px-3 py-1 rounded-lg"
                style={{ background: "hsl(36,20%,90%)", color: "hsl(25,40%,35%)" }}
              >
                Copy
              </button>
            </div>
            <pre
              className="text-xs leading-relaxed whitespace-pre-wrap font-sans"
              style={{ color: "hsl(25,20%,22%)" }}
            >
              {draft}
            </pre>
          </div>
        </motion.div>
      )}

      {!draft && (
        <p className="text-center text-xs mt-2" style={{ color: "hsl(36,10%,55%)" }}>
          Your draft will be built from your logged wins above.
        </p>
      )}
    </motion.div>
  );
}

// ─── Tab: Settings ───────────────────────────────────────────────────────────
function SettingsTab({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [wedEnabled, setWedEnabled] = useState(true);
  const [friEnabled, setFriEnabled] = useState(true);

  const connections = [
    { id: "gmail",   icon: "📧", name: "Gmail",   desc: "Auto-capture wins from email threads",        connected: false },
    { id: "slack",   icon: "💬", name: "Slack",   desc: "Surface kudos and shoutouts from channels",   connected: false },
    { id: "granola", icon: "📝", name: "Granola", desc: "Import wins from meeting notes",              connected: false },
  ];

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

      {/* Connections */}
      <section className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "hsl(36,10%,52%)" }}>
          Connections
        </h3>
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(36,20%,88%)" }}>
          {connections.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-3 p-4"
              style={{
                background: "hsl(36,40%,98%)",
                borderBottom: i < connections.length - 1 ? "1px solid hsl(36,20%,90%)" : "none",
              }}
            >
              <span className="text-xl">{c.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "hsl(25,20%,16%)" }}>{c.name}</p>
                <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>{c.desc}</p>
              </div>
              <button
                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl"
                style={{ background: "hsl(36,20%,90%)", color: "hsl(25,40%,35%)" }}
              >
                Connect
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs mt-2 text-center" style={{ color: "hsl(36,10%,56%)" }}>
          Integrations coming soon — we'll notify you when they're ready.
        </p>
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
        Career Compass · v1.0
      </p>
    </motion.div>
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
