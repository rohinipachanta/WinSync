import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, type InsertUser } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Award, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { z } from "zod";

export default function AuthPage() {
  const { user, login, register } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("login");

  if (user) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="fixed bottom-2 right-2 text-xs text-muted-foreground opacity-40 select-none">v8</div>
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="hidden md:flex flex-col justify-center space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-4xl">⚡</span>
            <span className="text-2xl font-bold text-primary">Winsync</span>
          </div>
          <h1 className="text-5xl font-bold font-display leading-tight text-foreground">
            Never blank on <span className="text-gradient">review day</span> again.
          </h1>
          <p className="text-lg text-muted-foreground max-w-sm leading-relaxed">
            Your wins and feedback — captured automatically from Gmail and Slack, so your career story is always ready when you need it.
          </p>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">✓ Wednesday & Friday digests</div>
            <div className="flex items-center gap-2">✓ AI coaching on constructive feedback</div>
            <div className="flex items-center gap-2">✓ One-tap self-review generator</div>
          </div>
        </div>

        <Card className="w-full glass-panel border-0 shadow-2xl">
          <CardHeader className="space-y-1 pb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-2xl">⚡</span>
              <CardTitle className="text-2xl font-bold">Winsync</CardTitle>
            </div>
            <CardDescription className="text-center">
              Sign in to your account or create a new one
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <AuthForm 
                  mode="login" 
                  onSubmit={(data) => login.mutate(data)} 
                  isPending={login.isPending} 
                />
                <div className="mt-4 text-center">
                  <ResetPasswordDialog />
                </div>
              </TabsContent>
              
              <TabsContent value="register">
                <AuthForm 
                  mode="register" 
                  onSubmit={(data) => register.mutate(data)} 
                  isPending={register.isPending} 
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResetPasswordDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  
  const resetSchema = z.object({
    username: z.string().min(1, "Username is required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
  });

  const form = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      username: "",
      newPassword: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof resetSchema>) => {
    setIsPending(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to reset password");
      }
      
      toast({
        title: "Success",
        description: "Password reset successfully. Please login with your new password.",
      });
      setOpen(false);
      form.reset();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary h-auto p-0 font-normal underline-offset-4 hover:underline">
          Forgot password?
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Enter your username and new password to reset it.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="johndoe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset Password
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AuthForm({ 
  mode, 
  onSubmit, 
  isPending 
}: { 
  mode: "login" | "register", 
  onSubmit: (data: InsertUser) => void, 
  isPending: boolean 
}) {
  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="johndoe" {...field} className="bg-white/50" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} className="bg-white/50" />
              </FormControl>
              {mode === "register" && (
                <p className="text-xs text-muted-foreground">
                  At least 6 characters
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          className="w-full mt-2 font-semibold text-md h-11" 
          disabled={isPending}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "login" ? "Sign In" : "Create Account"}
        </Button>
      </form>
    </Form>
  );
}
