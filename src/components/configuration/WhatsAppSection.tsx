"use client";

import React, { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Power,
  Clock,
  ShieldCheck,
  Send,
  MessageSquare,
  Sparkles,
  Info,
} from "lucide-react";
import {
  getWhatsAppStatusAction,
  updateWhatsAppConfigAction,
  disconnectWhatsAppSessionAction,
} from "@/lib/whatsappActions";
import { WhatsAppMode } from "@prisma/client";
import { DEFAULT_TEMPLATES } from "@/lib/whatsappTemplates";

export default function WhatsAppSection() {
  const t = useTranslations("configuration");
  const locale = useLocale();
  const isAr = locale === "ar";
  const [isPending, startTransition] = useTransition();

  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState<any>(null);
  const [mode, setMode] = useState<WhatsAppMode>("OFF");

  // Trigger Toggles
  const [enableAbsenceTrigger, setEnableAbsenceTrigger] = useState(true);
  const [enableCreditZeroTrigger, setEnableCreditZeroTrigger] = useState(true);
  const [enablePreLesson24hTrigger, setEnablePreLesson24hTrigger] = useState(true);
  const [enableSpecialLessonTrigger, setEnableSpecialLessonTrigger] = useState(true);

  // Templates
  const [templates, setTemplates] = useState<Record<string, string>>({
    absenceAr: DEFAULT_TEMPLATES.absenceAr,
    absenceFr: DEFAULT_TEMPLATES.absenceFr,
    preLesson24hAr: DEFAULT_TEMPLATES.preLesson24hAr,
    preLesson24hFr: DEFAULT_TEMPLATES.preLesson24hFr,
    specialLessonNewAr: DEFAULT_TEMPLATES.specialLessonNewAr,
    specialLessonUpdAr: DEFAULT_TEMPLATES.specialLessonUpdAr,
    specialLessonCanAr: DEFAULT_TEMPLATES.specialLessonCanAr,
  });

  const [selectedTemplateKey, setSelectedTemplateKey] = useState("absenceAr");

  // Anti-Ban & Quiet Hours
  const [minInterval, setMinInterval] = useState(4);
  const [maxInterval, setMaxInterval] = useState(8);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");

  const [disconnecting, setDisconnecting] = useState(false);

  // Fetch status on mount and poll if waiting for QR scan
  const fetchStatus = async () => {
    try {
      const res = await getWhatsAppStatusAction();
      if (res.config) {
        setMode(res.config.mode);
        setEnableAbsenceTrigger(res.config.enableAbsenceTrigger);
        setEnableCreditZeroTrigger(res.config.enableCreditZeroTrigger);
        setEnablePreLesson24hTrigger(res.config.enablePreLesson24hTrigger);
        setEnableSpecialLessonTrigger(res.config.enableSpecialLessonTrigger);
        setMinInterval(res.config.minIntervalSeconds);
        setMaxInterval(res.config.maxIntervalSeconds);
        setQuietHoursEnabled(res.config.quietHoursEnabled);
        setQuietHoursStart(res.config.quietHoursStart);
        setQuietHoursEnd(res.config.quietHoursEnd);

        setTemplates({
          absenceAr: res.config.templateAbsenceAr || DEFAULT_TEMPLATES.absenceAr,
          absenceFr: res.config.templateAbsenceFr || DEFAULT_TEMPLATES.absenceFr,
          preLesson24hAr: res.config.templatePreLesson24hAr || DEFAULT_TEMPLATES.preLesson24hAr,
          preLesson24hFr: res.config.templatePreLesson24hFr || DEFAULT_TEMPLATES.preLesson24hFr,
          specialLessonNewAr: res.config.templateSpecialLessonNewAr || DEFAULT_TEMPLATES.specialLessonNewAr,
          specialLessonUpdAr: res.config.templateSpecialLessonUpdAr || DEFAULT_TEMPLATES.specialLessonUpdAr,
          specialLessonCanAr: res.config.templateSpecialLessonCanAr || DEFAULT_TEMPLATES.specialLessonCanAr,
        });
      }
      setLiveStatus(res.liveStatus);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 5 seconds if not connected to capture QR code scan
    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateWhatsAppConfigAction({
        mode,
        enableAbsenceTrigger,
        enableCreditZeroTrigger,
        enablePreLesson24hTrigger,
        enableSpecialLessonTrigger,
        templateAbsenceAr: templates.absenceAr,
        templateAbsenceFr: templates.absenceFr,
        templatePreLesson24hAr: templates.preLesson24hAr,
        templatePreLesson24hFr: templates.preLesson24hFr,
        templateSpecialLessonNewAr: templates.specialLessonNewAr,
        templateSpecialLessonUpdAr: templates.specialLessonUpdAr,
        templateSpecialLessonCanAr: templates.specialLessonCanAr,
        minIntervalSeconds: Number(minInterval),
        maxIntervalSeconds: Number(maxInterval),
        quietHoursEnabled,
        quietHoursStart,
        quietHoursEnd,
      });

      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleDisconnect = async () => {
    if (!confirm(isAr ? "هل أنت متأكد من إلغاء ربط هاتف المدرسة بواتساب؟" : "Confirmez-vous la déconnexion de WhatsApp ?")) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await disconnectWhatsAppSessionAction();
      if (res.success) {
        toast.success(res.message);
        fetchStatus();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erreur de déconnexion");
    } finally {
      setDisconnecting(false);
    }
  };

  const insertVariable = (varName: string) => {
    setTemplates((prev) => ({
      ...prev,
      [selectedTemplateKey]: (prev[selectedTemplateKey] || "") + ` {${varName}} `,
    }));
  };

  const isConnected = liveStatus?.isConnected;

  if (loading) {
    return (
      <div className="p-8 text-center text-muted animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded mx-auto mb-4" />
        <div className="h-40 bg-gray-100 rounded-xl max-w-xl mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* 1. DEVICE CONNECTION STATUS CARD */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${isConnected ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900">
                  {isAr ? "ربط هاتف المدرسة بواتساب" : "Liaison WhatsApp de l'établissement"}
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    isConnected ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                  {isConnected
                    ? isAr
                      ? "متصل بالهاتف"
                      : "Connecté"
                    : isAr
                    ? "بانتظار مسح رمز QR"
                    : "En attente du scan QR"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAr
                  ? "الاتصال مباشر عبر بروتوكول واتساب ويب (Baileys) بدون تكاليف إضافية"
                  : "Connexion directe via protocole WhatsApp Multi-Device (Baileys) sans frais"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatus}
              className="p-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-gray-600 transition"
              title={isAr ? "تحديث الحالة" : "Actualiser"}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {isConnected && (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <Power className="w-4 h-4" />
                {disconnecting ? (isAr ? "جارٍ الإلغاء..." : "Déconnexion...") : isAr ? "إلغاء ربط الهاتف" : "Déconnecter l'appareil"}
              </button>
            )}
          </div>
        </div>

        {/* CONNECTED VIEW */}
        {isConnected ? (
          <div className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="text-xs text-gray-400 font-medium block">
                {isAr ? "رقم الهاتف المتصل" : "Numéro connecté"}
              </span>
              <span className="text-base font-bold font-mono text-gray-800 mt-1 block" dir="ltr">
                +{liveStatus.phone || "213..."}
              </span>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="text-xs text-gray-400 font-medium block">
                {isAr ? "اسم الحساب" : "Nom du profil"}
              </span>
              <span className="text-base font-bold text-gray-800 mt-1 block">
                {liveStatus.name || "Massinissa School"}
              </span>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="text-xs text-gray-400 font-medium block">
                {isAr ? "حالة الخادم (OCI)" : "Passerelle (OCI)"}
              </span>
              <span className="text-base font-bold text-emerald-600 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {isAr ? "نشط ومستمر" : "Opérationnel 24/7"}
              </span>
            </div>
          </div>
        ) : (
          /* DISCONNECTED QR CODE SCAN VIEW */
          <div className="pt-6 flex flex-col md:flex-row items-center justify-center gap-8">
            <div className="bg-white p-4 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center">
              {liveStatus?.qr ? (
                <div className="relative w-56 h-56">
                  <Image
                    src={liveStatus.qr}
                    alt="WhatsApp QR Code"
                    fill
                    className="rounded-lg object-contain"
                  />
                </div>
              ) : (
                <div className="w-56 h-56 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-lg">
                  <QrCode className="w-12 h-12 animate-pulse mb-2 text-gray-300" />
                  <span className="text-xs text-center px-4">
                    {isAr
                      ? "جارٍ توليد رمز QR من خادم واتساب..."
                      : "Génération du QR Code en cours..."}
                  </span>
                </div>
              )}
              <span className="text-[11px] text-gray-400 mt-3 font-mono">
                {isAr ? "يتجدد الرمز تلقائياً كل 20 ثانية" : "Renouvellement auto toutes les 20s"}
              </span>
            </div>

            <div className="max-w-md space-y-3 text-sm text-gray-600">
              <h4 className="font-bold text-gray-900 text-base">
                {isAr ? "خطوات ربط هاتف المؤسسة:" : "Instructions de liaison :"}
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-xs text-gray-700">
                <li>
                  {isAr
                    ? "افتح تطبيق واتساب على هاتف إدارة المدرسة."
                    : "Ouvrez WhatsApp sur le smartphone officiel de l'école."}
                </li>
                <li>
                  {isAr
                    ? "انتقل إلى الإعدادات > الأجهزة المرتبطة > ربط جهاز."
                    : "Allez dans Paramètres > Appareils connectés > Connecter un appareil."}
                </li>
                <li>
                  {isAr
                    ? "وجّه كاميرا الهاتف نحو رمز QR المعروض على الشاشة."
                    : "Pointez la caméra du téléphone vers le QR Code affiché."}
                </li>
              </ol>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  {isAr
                    ? "بفضل التثبيت على سحابة أوراكل (OCI)، تبقى الجلسة محفوظة دائماً دون الحاجة لمسح الرمز مجدداً عند إعادة تشغيل الخادم."
                    : "Grâce au stockage persistant OCI, la session reste active sans nouveau scan même en cas de redémarrage."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. THE THREE OPERATIONAL MODES */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-gray-900 mb-1">
          {isAr ? "وضع تشغيل ميزة واتساب" : "Mode de fonctionnement"}
        </h3>
        <p className="text-xs text-gray-500 mb-5">
          {isAr
            ? "حدد طريقة التعامل مع التنبيهات وإرسالها للأولياء والتلاميذ"
            : "Choisissez le degré d'automatisation des notifications"}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* OFF */}
          <label
            onClick={() => setMode("OFF")}
            className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col justify-between transition ${
              mode === "OFF"
                ? "border-gray-800 bg-gray-50 ring-2 ring-gray-800/10"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-gray-900">
                  {isAr ? "معطل (OFF)" : "Désactivé (OFF)"}
                </span>
                <input
                  type="radio"
                  name="waMode"
                  checked={mode === "OFF"}
                  onChange={() => setMode("OFF")}
                  className="accent-gray-900"
                />
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {isAr
                  ? "إيقاف الميزة بالكامل. لا يتم توليد أي إشعارات أو إرسال أي رسائل."
                  : "Moteur inactif. Aucun message généré ni transmis."}
              </p>
            </div>
            <span className="inline-block mt-3 text-[10px] font-bold text-gray-400 uppercase">
              {isAr ? "آمن ومغلق" : "Mode silencieux"}
            </span>
          </label>

          {/* MANUAL */}
          <label
            onClick={() => setMode("MANUAL")}
            className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col justify-between transition ${
              mode === "MANUAL"
                ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/10"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-blue-950 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  {isAr ? "يدوي (MANUAL)" : "Manuel (MANUAL)"}
                </span>
                <input
                  type="radio"
                  name="waMode"
                  checked={mode === "MANUAL"}
                  onChange={() => setMode("MANUAL")}
                  className="accent-blue-600"
                />
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {isAr
                  ? "توضع التنبيهات في قائمة انتظار الفروع للمراجعة، ويقوم إداريو الفروع بالنقر على زر الإرسال يدوياً."
                  : "Mise en file d'attente par succursale. Les administrateurs valident et envoient les alertes."}
              </p>
            </div>
            <span className="inline-block mt-3 text-[10px] font-bold text-blue-600 uppercase">
              {isAr ? "موصى به للتحكم التام" : "Contrôle humain"}
            </span>
          </label>

          {/* AUTO */}
          <label
            onClick={() => setMode("AUTO")}
            className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col justify-between transition ${
              mode === "AUTO"
                ? "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/10"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  {isAr ? "تلقائي بالكامل (AUTO)" : "Automatique (AUTO)"}
                </span>
                <input
                  type="radio"
                  name="waMode"
                  checked={mode === "AUTO"}
                  onChange={() => setMode("AUTO")}
                  className="accent-emerald-600"
                />
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {isAr
                  ? "إرسال التنبيهات مباشرة وتلقائياً فور تسجيل الغياب أو برمجة الحصص الخاصة وفق محددات الأمان ومكافحة الحظر."
                  : "Envoi instantané et autonome dès la survenance des déclencheurs via file d'attente anti-ban."}
              </p>
            </div>
            <span className="inline-block mt-3 text-[10px] font-bold text-emerald-600 uppercase">
              {isAr ? "سرعة وأتمتة كاملة" : "100% Autonome"}
            </span>
          </label>
        </div>
      </div>

      {/* 3. TRIGGER SWITCHES */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-gray-900 mb-1">
          {isAr ? "محددات التنبيهات التلقائية (Triggers)" : "Déclencheurs d'alertes (Triggers)"}
        </h3>
        <p className="text-xs text-gray-500 mb-5">
          {isAr
            ? "فعل أو عطل كل تنبيه على حدة لتحديد الحالات التي يتم إشعار الأولياء بها"
            : "Activez ou désactivez chaque type d'alerte indépendamment"}
        </p>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl hover:bg-gray-100/80 transition cursor-pointer">
            <div>
              <span className="font-bold text-sm text-gray-900 block">
                {isAr ? "1. تنبيه غياب التلميذ عن الحصة" : "1. Alerte absence élève"}
              </span>
              <span className="text-xs text-gray-500">
                {isAr
                  ? "يُرسل عند تسجيل التلميذ كغائب، مع إشعار تصحيحي مطمئن في حال التحاقه متأخراً"
                  : "Déclenché lors de la saisie d'absence, avec avis rectificatif en cas de retard"}
              </span>
            </div>
            <input
              type="checkbox"
              checked={enableAbsenceTrigger}
              onChange={(e) => setEnableAbsenceTrigger(e.target.checked)}
              className="w-5 h-5 accent-blue-600 rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl hover:bg-gray-100/80 transition cursor-pointer">
            <div>
              <span className="font-bold text-sm text-gray-900 block">
                {isAr ? "2. تنبيه نفاد الرصيد الفوري (0 حصص)" : "2. Alerte épuisement solde (0 séance)"}
              </span>
              <span className="text-xs text-gray-500">
                {isAr
                  ? "يُرسل فور استهلاك آخر حصة في الاشتراك للتذكير بالتجديد"
                  : "Envoyé immédiatement lorsque le solde d'un élève tombe à 0"}
              </span>
            </div>
            <input
              type="checkbox"
              checked={enableCreditZeroTrigger}
              onChange={(e) => setEnableCreditZeroTrigger(e.target.checked)}
              className="w-5 h-5 accent-blue-600 rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl hover:bg-gray-100/80 transition cursor-pointer">
            <div>
              <span className="font-bold text-sm text-gray-900 block">
                {isAr ? "3. تنبيه 24 ساعة قبل الحصة (تحذير الرصيد السالب -1)" : "3. Rappel 24h avant cours (Avertissement solde négatif -1)"}
              </span>
              <span className="text-xs text-gray-500">
                {isAr
                  ? "يُرسل قبل 24 ساعة من موعد الحصة للتلاميذ الذين رصيدهم 0 لتحذيرهم بأن الحضور بدون دفع سيجعل الرصيد -1"
                  : "Déclenché 24h avant le cours pour les soldes à 0 afin d'éviter le passage en solde négatif"}
              </span>
            </div>
            <input
              type="checkbox"
              checked={enablePreLesson24hTrigger}
              onChange={(e) => setEnablePreLesson24hTrigger(e.target.checked)}
              className="w-5 h-5 accent-blue-600 rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl hover:bg-gray-100/80 transition cursor-pointer">
            <div>
              <span className="font-bold text-sm text-gray-900 block">
                {isAr ? "4. إعلانات وتأكيدات الحصص الخاصة (إضافية / استدراكية)" : "4. Annonces et confirmations de séances spéciales"}
              </span>
              <span className="text-xs text-gray-500">
                {isAr
                  ? "يُرسل عند برمجة حصة خاصة، وعند تعديل موعدها يرسل تأكيداً رسميّاً لتفادي أي التباس"
                  : "Notifie la programmation et confirme expressément toute modification d'horaire"}
              </span>
            </div>
            <input
              type="checkbox"
              checked={enableSpecialLessonTrigger}
              onChange={(e) => setEnableSpecialLessonTrigger(e.target.checked)}
              className="w-5 h-5 accent-blue-600 rounded"
            />
          </label>
        </div>
      </div>

      {/* 4. TEMPLATES & LIVE PREVIEW */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {isAr ? "تخصيص قوالب الرسائل" : "Modèles des messages WhatsApp"}
            </h3>
            <p className="text-xs text-gray-500">
              {isAr
                ? "يمكنك تعديل النصوص وإدراج الوسوم التلقائية بدقة"
                : "Personnalisez le contenu et les balises dynamiques"}
            </p>
          </div>

          <select
            value={selectedTemplateKey}
            onChange={(e) => setSelectedTemplateKey(e.target.value)}
            className="text-xs font-bold border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800"
          >
            <option value="absenceAr">غـيـاب (عربية)</option>
            <option value="absenceFr">Absence (Français)</option>
            <option value="preLesson24hAr">تنبيه 24 ساعة - رصيد 0 (عربية)</option>
            <option value="preLesson24hFr">Rappel 24h - Solde 0 (Français)</option>
            <option value="specialLessonNewAr">حصة خاصة جديدة (عربية)</option>
            <option value="specialLessonUpdAr">⚠️ تأكيد تعديل موعد حصة خاصة (عربية)</option>
            <option value="specialLessonCanAr">❌ إلغاء حصة خاصة (عربية)</option>
          </select>
        </div>

        {/* DYNAMIC VARIABLE CHIPS */}
        <div className="mb-3">
          <span className="text-[11px] text-gray-400 font-bold block mb-1.5">
            {isAr ? "الوسوم الديناميكية المتاحة (انقر للإدراج):" : "Balises disponibles (cliquer pour insérer) :"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {["student_name", "global_number", "class_name", "teacher_name", "date", "start_time", "end_time", "branch_name", "classroom_name"].map(
              (tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => insertVariable(tag)}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-[11px] font-mono transition"
                >
                  +{`{${tag}}`}
                </button>
              )
            )}
          </div>
        </div>

        {/* TEXTAREA & LIVE BUBBLE PREVIEW */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <textarea
            rows={8}
            value={templates[selectedTemplateKey] || ""}
            onChange={(e) =>
              setTemplates((prev) => ({ ...prev, [selectedTemplateKey]: e.target.value }))
            }
            className="w-full border border-gray-300 rounded-xl p-3 text-xs text-gray-800 leading-relaxed font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            dir={selectedTemplateKey.endsWith("Ar") ? "rtl" : "ltr"}
          />

          {/* SIMULATED WHATSAPP CHAT BUBBLE */}
          <div className="bg-[#EFEAE2] p-4 rounded-xl border border-gray-200 flex flex-col justify-end">
            <span className="text-[10px] text-gray-400 uppercase font-bold mb-2">
              {isAr ? "معاينة الرسالة كما تظهر لولي الأمر:" : "Aperçu du message WhatsApp :"}
            </span>
            <div className="bg-[#D9FDD3] text-[#111B21] p-3 rounded-lg rounded-tr-none shadow-sm text-xs leading-relaxed max-w-[95%] self-end">
              <p className="whitespace-pre-wrap font-sans">
                {(templates[selectedTemplateKey] || "")
                  .replace(/\{student_name\}/g, "أمين بن علي")
                  .replace(/\{global_number\}/g, "1042")
                  .replace(/\{class_name\}/g, "4AM رياضيات فوج 1")
                  .replace(/\{teacher_name\}/g, "أ. بلقاسم")
                  .replace(/\{date\}/g, "الأحد 25 أكتوبر 2026")
                  .replace(/\{start_time\}/g, "14:00")
                  .replace(/\{end_time\}/g, "16:00")
                  .replace(/\{branch_name\}/g, "فرع أمفي (AMPHI)")
                  .replace(/\{classroom_name\}/g, "قاعة 3")
                  .replace(/\{old_date\}/g, "السبت 24 أكتوبر")
                  .replace(/\{old_start_time\}/g, "10:00")
                  .replace(/\{new_date\}/g, "الأحد 25 أكتوبر")
                  .replace(/\{new_start_time\}/g, "14:00")
                  .replace(/\{new_end_time\}/g, "16:00")
                  .replace(/\{lesson_type\}/g, "حصة إضافية")}
              </p>
              <div className="text-[10px] text-gray-500 text-left mt-1 flex items-center justify-end gap-1">
                <span>14:02</span>
                <span className="text-[#53BDEB]">✓✓</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. ANTI-BAN & QUIET HOURS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="text-base font-bold text-gray-900">
            {isAr ? "إعدادات الأمان ومكافحة حظر الرقم (Anti-Ban)" : "Sécurité et protection Anti-Ban"}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <span className="text-xs font-bold text-gray-800 block mb-1">
              {isAr ? "الفاصل الزمني العشوائي بين الرسائل" : "Délai aléatoire entre messages"}
            </span>
            <p className="text-[11px] text-gray-500 mb-3">
              {isAr
                ? "يمنع خوارزميات واتساب من اعتبار الإرسال الجماعي كرسائل مزعجة (Spam)"
                : "Évite la détection par les filtres anti-spam de Meta"}
            </p>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span>{minInterval}s</span>
              <span className="text-gray-400">إلى</span>
              <span>{maxInterval}s</span>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-gray-800">
                {isAr ? "ساعات الهدوء الليلي" : "Période de silence nocturne"}
              </span>
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </div>
            <p className="text-[11px] text-gray-500 mb-3">
              {isAr
                ? "تأجيل التنبيهات المبرمجة ليلاً إلى صبيحة اليوم التالي الساعة 08:15"
                : "Reporte les envois nocturnes au lendemain matin à 08h15"}
            </p>
            <div className="flex items-center gap-2 text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span>{quietHoursStart}</span>
              <span className="text-gray-400">إلى</span>
              <span>{quietHoursEnd}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SAVE BUTTON */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition disabled:bg-blue-300 flex items-center gap-2"
        >
          {isPending ? (
            <span>{isAr ? "جارٍ الحفظ..." : "Enregistrement..."}</span>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>{isAr ? "حفظ إعدادات واتساب" : "Enregistrer la configuration"}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
