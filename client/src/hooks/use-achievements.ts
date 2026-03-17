import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type InsertAchievement } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useAchievements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const achievementsQuery = useQuery({
    queryKey: [api.achievements.list.path],
    queryFn: async () => {
      const res = await fetch(api.achievements.list.path);
      if (!res.ok) throw new Error("Failed to fetch achievements");
      return api.achievements.list.responses[200].parse(await res.json());
    },
    refetchInterval: 30000,       // auto-refresh every 30 seconds
    refetchOnWindowFocus: true,   // refresh when user switches back to the tab
  });

  const createAchievementMutation = useMutation({
    mutationFn: async (data: InsertAchievement) => {
      const res = await fetch(api.achievements.create.path, {
        method: api.achievements.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Create achievement failed:", errorText);
        let message = "Failed to create achievement";
        try {
          const errorJson = JSON.parse(errorText);
          message = errorJson.message || message;
        } catch (e) {
          // fallback to default
        }
        throw new Error(message);
      }
      return api.achievements.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.achievements.list.path] });
      toast({
        title: "Saved!",
        description: "Win added to your log.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const confirmAchievementMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/achievements/${id}/confirm`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to confirm");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.achievements.list.path] });
      toast({ title: "Win confirmed! 🎉", description: "Added to your wins log." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Could not confirm this item." });
    },
  });

  const dismissAchievementMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/achievements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to dismiss");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.achievements.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/achievements/dismissed"] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Could not dismiss this item." });
    },
  });

  const dismissedQuery = useQuery({
    queryKey: ["/api/achievements/dismissed"],
    queryFn: async () => {
      const res = await fetch("/api/achievements/dismissed");
      if (!res.ok) throw new Error("Failed to fetch dismissed items");
      return await res.json() as typeof achievementsQuery.data;
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const restoreAchievementMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/achievements/${id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to restore");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.achievements.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/achievements/dismissed"] });
      toast({ title: "Restored!", description: "Item moved back to your wins." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Could not restore this item." });
    },
  });

  const editAchievementMutation = useMutation({
    mutationFn: async ({ id, title, feedbackType, achievementDate }: { id: number; title: string; feedbackType: string; achievementDate: string }) => {
      const res = await fetch(`/api/achievements/${id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, feedbackType, achievementDate }),
      });
      if (!res.ok) throw new Error("Failed to edit");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.achievements.list.path] });
      toast({ title: "Updated!", description: "Win has been saved." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Could not update this win." });
    },
  });

  const requestCoachingMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/achievements/${id}/coach`, {
        method: "POST",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to request coaching");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.achievements.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Coach response ready!",
        description: "Tap the achievement to read it.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  return {
    achievements: achievementsQuery.data,
    isLoading: achievementsQuery.isLoading,
    error: achievementsQuery.error,
    createAchievement: createAchievementMutation,
    confirmAchievement: confirmAchievementMutation,
    dismissAchievement: dismissAchievementMutation,
    editAchievement: editAchievementMutation,
    requestCoaching: requestCoachingMutation,
    dismissedAchievements: dismissedQuery.data ?? [],
    isDismissedLoading: dismissedQuery.isLoading,
    restoreAchievement: restoreAchievementMutation,
  };
}
