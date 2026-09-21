import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Lock, ArrowRight, LogIn } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setStoredUserIdentity, UserIdentity, ROLE_ADMIN, ROLE_AREA_MANAGER } from "@/lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmedUser = username.trim();

    if (!trimmedUser) {
      setErrorMsg("Please enter your Username or User ID.");
      return;
    }

    setIsSubmitting(true);

    let targetIdentity: UserIdentity;

    if (trimmedUser.toLowerCase() === "admin") {
      targetIdentity = {
        user_id: "admin",
        name: "Admin",
        app_role: ROLE_ADMIN,
        branch_oid: null,
        branch_name: null,
      };
    } else {
      // Default to valid Area Manager account EMP009 (Rahul Paigude) in database
      targetIdentity = {
        user_id: "EMP009",
        name: "Rahul Paigude",
        app_role: ROLE_AREA_MANAGER,
        branch_oid: 6,
        branch_name: "Pune",
      };
    }

    setStoredUserIdentity(targetIdentity);
    sessionStorage.setItem("access_token", `mock_token_${targetIdentity.user_id}`);

    setTimeout(() => {
      setIsSubmitting(false);
      navigate("/dashboard");
    }, 300);
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 relative overflow-hidden transition-colors">
      {/* Background Accent Decorative Elements */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm space-y-4 relative z-10 my-auto">
        {/* Logo */}
        <div className="flex justify-center pb-1">
          <img
            src="/vigilo_logo.png"
            alt="Vigilo M"
            className="h-28 w-28 rounded-2xl shadow-xl object-contain border border-slate-200/80 dark:border-cyan-500/30 dark:shadow-[0_0_25px_rgba(6,182,212,0.25)] transition-all"
          />
        </div>

        {/* Login Card */}
        <Card className="border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl rounded-2xl overflow-hidden transition-colors">
          <CardHeader className="space-y-1 p-5 pb-3 border-b border-slate-100 dark:border-slate-800/80">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <LogIn className="h-4 w-4 text-primary" />
              Sign In
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Enter your credentials to establish an authorized session
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-4">
            <form onSubmit={handleLogin} className="space-y-4">
              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Username / User ID Input */}
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Username / User ID
                  </Label>
                  <span className="text-[10px] text-slate-400">Required</span>
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    required
                    placeholder="Enter Username or User ID"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 text-xs h-10 pl-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary caret-slate-900 dark:caret-white font-medium shadow-sm"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Password
                  </Label>
                  <span className="text-[10px] text-slate-400">Required</span>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    type="password"
                    required
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 text-xs h-10 pl-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary caret-slate-900 dark:caret-white font-medium shadow-sm"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-10 text-xs rounded-xl shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2 mt-3"
              >
                {isSubmitting ? (
                  <span>Signing in...</span>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
