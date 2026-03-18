import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Goal {
  id: number;
  userId: number;
  title: string;
  createdAt: Date;
  archivedAt: Date | null;
  seasonId: number | null;
}

interface GoalProgress {
  goal: Goal;
  winCount: number;
  lastWinDate: Date | null;
  needsNudge: boolean;
}

export function GoalsManager() {
  const [goals, setGoals] = useState<GoalProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/goals/progress");
      if (!res.ok) throw new Error("Failed to fetch goals");
      const data = await res.json();
      setGoals(data);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const createGoal = async () => {
    if (!newGoalTitle.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Goal title is required" });
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newGoalTitle.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create goal");
      setNewGoalTitle("");
      await fetchGoals();
      toast({ title: "Goal created!", description: "Start tagging wins to this goal." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setIsCreating(false);
    }
  };

  const deleteGoal = async (goalId: number) => {
    setIsDeleting(goalId);
    try {
      const res = await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete goal");
      await fetchGoals();
      toast({ title: "Goal archived" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setIsDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "hsl(25,55%,42%)" }} />
      </div>
    );
  }

  return (
    <section className="mb-6">
      <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "hsl(36,10%,52%)" }}>
        Goals & Objectives (3-5 recommended)
      </h3>

      {/* Create new goal */}
      <div className="mb-3 flex gap-2">
        <Input
          value={newGoalTitle}
          onChange={(e) => setNewGoalTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createGoal()}
          placeholder="Add a new goal..."
          className="h-9 rounded-xl"
          style={{
            background: "hsl(36,30%,94%)",
            border: "1px solid hsl(36,20%,84%)",
            color: "hsl(25,20%,16%)",
          }}
          disabled={isCreating}
        />
        <Button
          size="sm"
          className="h-9 px-3 rounded-xl font-semibold shrink-0"
          style={{ background: "hsl(25,55%,42%)", color: "white" }}
          onClick={createGoal}
          disabled={isCreating || !newGoalTitle.trim()}
        >
          {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {/* Goals list */}
      <div className="space-y-2">
        <AnimatePresence>
          {goals.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-3 rounded-xl text-center text-sm"
              style={{ background: "hsl(36,25%,92%)", color: "hsl(36,10%,52%)" }}
            >
              No goals yet. Create one to start tracking progress.
            </motion.div>
          ) : (
            goals.map((gp) => (
              <motion.div
                key={gp.goal.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-xl p-3"
                style={{
                  background: gp.needsNudge ? "hsl(15,70%,95%)" : "hsl(36,40%,98%)",
                  border: gp.needsNudge ? "1px solid hsl(15,60%,80%)" : "1px solid hsl(36,20%,88%)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "hsl(25,20%,16%)" }}>
                      {gp.goal.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: "hsl(36,10%,52%)" }}>
                      <span>
                        <strong>{gp.winCount}</strong> {gp.winCount === 1 ? "win" : "wins"}
                      </span>
                      {gp.lastWinDate && (
                        <span>
                          • Last: {new Date(gp.lastWinDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                    {gp.needsNudge && (
                      <p className="mt-1 text-xs font-semibold" style={{ color: "hsl(15,80%,40%)" }}>
                        ⚠️ Haven't logged progress in 60+ days
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteGoal(gp.goal.id)}
                    disabled={isDeleting === gp.goal.id}
                    className="p-1 rounded-lg transition-colors shrink-0"
                    style={{
                      color: "hsl(36,10%,52%)",
                      background: "transparent",
                    }}
                    title="Archive goal"
                  >
                    {isDeleting === gp.goal.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
