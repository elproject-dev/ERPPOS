import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Mail, Lock, LogIn, Eye, EyeOff, Smartphone, Monitor, Download, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { getDefaultRoute } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function LoginPage() {
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [isDemoDialogOpen, setIsDemoDialogOpen] = useState(false);
  const [androidUrl, setAndroidUrl] = useState<string | null>(null);
  const [desktopUrl, setDesktopUrl] = useState<string | null>(null);

  // Get custom primary color from localStorage
  const [primaryHue, setPrimaryHue] = useState(() => parseInt(localStorage.getItem('primaryHue') || '15'));
  const [primarySaturation, setPrimarySaturation] = useState(() => parseInt(localStorage.getItem('primarySaturation') || '100'));
  const [primaryLightness, setPrimaryLightness] = useState(() => parseInt(localStorage.getItem('primaryLightness') || '45'));

  useEffect(() => {
    const syncColor = () => {
      setPrimaryHue(parseInt(localStorage.getItem('primaryHue') || '15'));
      setPrimarySaturation(parseInt(localStorage.getItem('primarySaturation') || '100'));
      setPrimaryLightness(parseInt(localStorage.getItem('primaryLightness') || '45'));
    };

    syncColor();
    window.addEventListener('storeSettingsChanged', syncColor);
    return () => window.removeEventListener('storeSettingsChanged', syncColor);
  }, []);

  // Fetch download URLs
  useEffect(() => {
    const fetchDownloadUrls = async () => {
      try {
        // Menggunakan app_config karena RLS storage list() dibatasi untuk anonymous
        const { data, error } = await supabase.from('app_config').select('key, value');

        if (data && !error) {
          const versionObj = data.find(item => item.key === 'app_version_latest');
          if (versionObj && versionObj.value) {
            const version = versionObj.value;

            // Generate public URL menggunakan konvensi penamaan script release
            const apkPath = `android/elproject_v.${version}.apk`;
            const exePath = `desktop/elproject_${version}_x64-setup.exe`;

            const { data: androidData } = supabase.storage.from('app-releases').getPublicUrl(apkPath);
            const { data: desktopData } = supabase.storage.from('app-releases').getPublicUrl(exePath);

            setAndroidUrl(androidData.publicUrl);
            setDesktopUrl(desktopData.publicUrl);
          }
        }
      } catch (error) {
        console.error("Gagal mengambil link download:", error);
      }
    };
    fetchDownloadUrls();
  }, []);

  const primaryColor = `hsl(${primaryHue}, ${primarySaturation}%, ${primaryLightness}%)`;
  const primaryDark = `hsl(${primaryHue}, ${primarySaturation}%, ${Math.max(primaryLightness - 20, 20)}%)`;
  const primaryDarker = `hsl(${primaryHue}, ${primarySaturation}%, ${Math.max(primaryLightness - 30, 10)}%)`;

  useEffect(() => {
    if (user) {
      setLocation(getDefaultRoute(user));
    }
  }, [user, setLocation]);

  if (user) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const sessionUser = await login(email, password);
      toast({
        title: "Login berhasil",
        description: `Selamat datang, ${sessionUser.name}`,
        variant: "success",
      });
      setLocation(getDefaultRoute(sessionUser));
    } catch (error) {
      toast({
        title: "Login gagal",
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${primaryDarker} 0%, ${primaryDark} 50%, ${primaryColor} 100%)`
      }}
    >
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-sm bg-white/5 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-sm bg-black/20 blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-[420px] relative z-10">
        <div className="text-center mb-10">
          <img src={`${import.meta.env.BASE_URL}td.png`} alt="Logo" className="h-28 w-auto mx-auto object-contain mb-5 drop-shadow-2xl" />
        </div>

        <div className="relative group">
          {/* Subtle glow behind card */}
          <div className="absolute -inset-1 bg-gradient-to-r from-white/20 to-white/0 rounded-md blur opacity-30 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>

          <div className="relative bg-white/10 backdrop-blur-2xl rounded-md border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] p-8 sm:p-10 flex flex-col items-center">
            <form onSubmit={handleSubmit} className="space-y-6 w-full">
              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-white/90 ml-1">Email</label>
                <div className="relative group/input">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 group-focus-within/input:text-white transition-colors duration-300" />
                  <Input
                    type="email"
                    placeholder="Masukkan email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 pl-11 bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-sm focus:bg-white/10 focus:border-white/30 focus:ring-4 focus:ring-white/10 focus-visible:ring-0 focus-visible:border-white/30 focus-visible:ring-offset-0 transition-all duration-300"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-white/90 ml-1">Password</label>
                <div className="relative group/input">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 group-focus-within/input:text-white transition-colors duration-300" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pl-11 pr-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-sm focus:bg-white/10 focus:border-white/30 focus:ring-4 focus:ring-white/10 focus-visible:ring-0 focus-visible:border-white/30 focus-visible:ring-offset-0 transition-all duration-300"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <button
                    type="button"
                    onClick={() => setIsDemoDialogOpen(true)}
                    className="text-white/80 text-xs sm:text-sm hover:text-emerald-300 hover:underline transition-colors inline-flex items-center gap-1.5 font-medium cursor-pointer"
                  >
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                    </span>
                    Live Demo
                  </button>
                  <Link href="/forgot-password" className="text-white/70 text-xs sm:text-sm hover:text-white hover:underline transition-colors cursor-pointer">
                    Lupa Kata Sandi?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 mt-4 rounded-sm border border-white/20 text-white font-semibold text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-300"
                style={{ backgroundColor: primaryColor }}
                disabled={isSubmitting}
              >
                <LogIn className="w-5 h-5 mr-2.5" />
                {isSubmitting ? "Memproses..." : "Masuk ke Sistem"}
              </Button>
            </form>

            <div className="mt-6 text-center w-full">
              <p className="text-white/70 text-sm mb-6">
                Belum punya akun?{" "}
                <Link href="/register" className="text-white font-semibold hover:underline hover:text-white/90 transition-colors cursor-pointer">
                  Daftar sekarang
                </Link>
              </p>

              <button
                type="button"
                onClick={() => setShowDownloads(!showDownloads)}
                className="relative flex flex-col items-center justify-center pt-2 w-full group/toggle cursor-pointer"
              >
                <div className="w-full flex items-center">
                  <div className="flex-grow border-t border-white/20 group-hover/toggle:border-white/40 transition-colors"></div>
                  <div className="mx-4 text-white/50 group-hover/toggle:text-white/80 transition-colors">
                    <span className="text-xs font-medium uppercase tracking-wider">Download Aplikasi</span>
                  </div>
                  <div className="flex-grow border-t border-white/20 group-hover/toggle:border-white/40 transition-colors"></div>
                </div>
                {!showDownloads && (
                  <div className="mt-2">
                    <ChevronDown className="w-4 h-4 text-white/40 group-hover/toggle:text-white/60 transition-colors" />
                  </div>
                )}
              </button>

              <div
                className={`grid transition-all duration-300 ease-in-out w-full ${showDownloads ? "grid-rows-[1fr] opacity-100 mt-2 mb-4" : "grid-rows-[0fr] opacity-0 mt-0 mb-0"
                  }`}
              >
                <div className="overflow-hidden">
                  <div className="grid grid-cols-2 gap-3 w-full pb-2">
                    <Button
                      variant="outline"
                      type="button"
                      className="bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white rounded-sm h-12 transition-all duration-300 flex items-center justify-center gap-2 group"
                      onClick={(e) => {
                        e.preventDefault();
                        if (androidUrl) window.open(androidUrl, '_blank');
                      }}
                      disabled={!androidUrl}
                    >
                      <Smartphone className="w-4 h-4 text-white/70 group-hover:text-white group-hover:-translate-y-0.5 transition-all" />
                      <span className="font-semibold text-sm">Android</span>
                      <Download className="w-3 h-3 opacity-50" />
                    </Button>

                    <Button
                      variant="outline"
                      type="button"
                      className="bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white rounded-sm h-12 transition-all duration-300 flex items-center justify-center gap-2 group"
                      onClick={(e) => {
                        e.preventDefault();
                        if (desktopUrl) window.open(desktopUrl, '_blank');
                      }}
                      disabled={!desktopUrl}
                    >
                      <Monitor className="w-4 h-4 text-white/70 group-hover:text-white group-hover:-translate-y-0.5 transition-all" />
                      <span className="font-semibold text-sm">Desktop</span>
                      <Download className="w-3 h-3 opacity-50" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Demo Popup Dialog */}
      <Dialog open={isDemoDialogOpen} onOpenChange={setIsDemoDialogOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 text-white border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              Informasi Akun Live Demo
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Klik salah satu akun di bawah untuk mengisi form login secara otomatis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2">
            {/* Admin */}
            <div
              onClick={() => {
                setEmail("admin@admin.com");
                setPassword("123456");
                setIsDemoDialogOpen(false);
                toast({ title: "Akun Terpilih", description: "Email & password Admin telah diisi", variant: "success" });
              }}
              className="p-3 rounded-lg border border-slate-800 bg-slate-800/60 hover:bg-slate-800 hover:border-emerald-500/50 transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-500/30">
                  ADM
                </div>
                <div>
                  <div className="text-sm font-semibold text-white group-hover:text-emerald-300">
                    Admin / Superuser
                  </div>
                  <div className="text-xs text-slate-400 font-mono">admin@admin.com</div>
                </div>
              </div>
              <div className="text-xs text-slate-300 font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-700">
                123456
              </div>
            </div>

            {/* Sales 1 */}
            <div
              onClick={() => {
                setEmail("sales1@sales.com");
                setPassword("123456");
                setIsDemoDialogOpen(false);
                toast({ title: "Akun Terpilih", description: "Email & password Sales 1 telah diisi", variant: "success" });
              }}
              className="p-3 rounded-lg border border-slate-800 bg-slate-800/60 hover:bg-slate-800 hover:border-blue-500/50 transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-500/30">
                  S1
                </div>
                <div>
                  <div className="text-sm font-semibold text-white group-hover:text-blue-300">
                    Sales 1
                  </div>
                  <div className="text-xs text-slate-400 font-mono">sales1@sales.com</div>
                </div>
              </div>
              <div className="text-xs text-slate-300 font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-700">
                123456
              </div>
            </div>

            {/* Sales 2 */}
            <div
              onClick={() => {
                setEmail("sales2@sales.com");
                setPassword("123456");
                setIsDemoDialogOpen(false);
                toast({ title: "Akun Terpilih", description: "Email & password Sales 2 telah diisi", variant: "success" });
              }}
              className="p-3 rounded-lg border border-slate-800 bg-slate-800/60 hover:bg-slate-800 hover:border-purple-500/50 transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0 border border-purple-500/30">
                  S2
                </div>
                <div>
                  <div className="text-sm font-semibold text-white group-hover:text-purple-300">
                    Sales 2
                  </div>
                  <div className="text-xs text-slate-400 font-mono">sales2@sales.com</div>
                </div>
              </div>
              <div className="text-xs text-slate-300 font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-700">
                123456
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
