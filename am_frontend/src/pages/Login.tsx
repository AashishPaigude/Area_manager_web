import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Lock, ArrowRight, LogIn, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setStoredUserIdentity, UserIdentity } from "@/lib/auth";
import api from "@/services/api";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmedUser = username.trim();

    if (!trimmedUser) {
      setErrorMsg("Please enter your Username or User ID.");
      return;
    }
    if (!password) {
      setErrorMsg("Please enter your Password.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Authenticate against database USER_CREDENTIALS
      const response = await api.post("/api/v1/auth/login", {
        username: trimmedUser,
        password: password,
      });

      const { user: userCtx, access_token } = response.data;
      const roleStr =
        typeof userCtx.app_role === "object"
          ? userCtx.app_role.value
          : String(userCtx.app_role);

      const targetIdentity: UserIdentity = {
        user_id: userCtx.user_id,
        name: userCtx.name,
        app_role: roleStr,
        branch_oid: userCtx.branch_oid,
        branch_name: userCtx.branch_name || null,
      };

      setStoredUserIdentity(targetIdentity);
      sessionStorage.setItem("access_token", access_token || `token_${targetIdentity.user_id}`);

      setTimeout(() => {
        setIsSubmitting(false);
        navigate("/dashboard");
      }, 200);
    } catch (err: any) {
      setIsSubmitting(false);
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        "Invalid username or password.";
      setErrorMsg(msg);
    }
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
            <CardTitle className="text-base font-bold text-slate-900 dark:white flex items-center gap-2">
              <LogIn className="h-4 w-4 text-primary" />
              Sign In
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
              Enter your User ID and credentials to sign in
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
                    placeholder="Enter your User ID (e.g. AM_SAXENA or ED-001, AM_KAMAT or S05007, EMP009)"
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
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 text-xs h-10 pl-10 pr-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary caret-slate-900 dark:caret-white font-medium shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-10 text-xs rounded-xl shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2 mt-3"
              >
                {isSubmitting ? (
                  <span>Authenticating...</span>
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
