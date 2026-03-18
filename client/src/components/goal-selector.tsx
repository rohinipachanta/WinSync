import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check } from "lucide-react";

interface Goal {
  id: number;
  title: string;
}

interface GoalSelectorProps {
  selectedGoalIds: number[];
  onChange: (goalIds: number[]) => void;
}

export function GoalSelector({ selectedGoalIds, onChange }: GoalSelectorProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const res = await fetch("/api/goals");
      if (!res.ok) throw new Error("Failed to fetch goals");
      const data = await res.json();
      setGoals(data);
    } catch (err: any) {
      console.error("Failed to fetch goals:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleGoal = (goalId: number) => {
    if (selectedGoalIds.includes(goalId)) {
      onChange(selectedGoalIds.filter(id => id !== goalId));
    } else {
      onChange([...selectedGoalIds, goalId]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "hsl(25,55%,42%)" }} />
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <p className="text-xs" style={{ color: "hsl(36,10%,52%)" }}>
        No goals yet. Create one in the Goals section to tag wins.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold" style={{ color: "hsl(25,20%,16%)" }}>
        Tag to Goals (optional)
      </label>
      <div className="flex flex-wrap gap-2">
        {goals.map(goal => (
          <button
            key={goal.id}
            onClick={() => toggleGoal(goal.id)}
            className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: selectedGoalIds.includes(goal.id) ? "hsl(25,55%,42%)" : "hsl(36,30%,94%)",
              color: selectedGoalIds.includes(goal.id) ? "white" : "hsl(25,20%,16%)",
              border: selectedGoalIds.includes(goal.id) ? "1px solid hsl(25,55%,42%)" : "1px solid hsl(36,20%,84%)",
            }}
          >
            {selectedGoalIds.includes(goal.id) && <Check className="w-3 h-3" />}
            {goal.title}
          </button>
        ))}
      </div>
    </div>
  );
}
