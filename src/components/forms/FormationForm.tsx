"use client";

import { useState, Dispatch, SetStateAction } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import {
  createFormationWithLevels,
  updateFormationGroup,
  updateFormationWithLevels,
} from "@/lib/formationActions";

type LevelInput = {
  id?: number;
  name: string;
  lumpSumPrice: number;
  levelNumber?: number;
  isDeleted?: boolean;
  enrollmentsCount?: number;
};

interface FormationFormProps {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: {
    languages?: Array<{ id: number; name: string }>;
    branches?: Array<{ id: number; name: string }>;
    teachers?: Array<{ id: string; name: string }>;
    defaultBranchId?: number;
    levels?: Array<{ id: number; name: string; lumpSumPrice: number; levelNumber?: number; enrollmentsCount?: number }>;
  };
}

const FormationForm = ({
  type,
  data,
  setOpen,
  relatedData,
}: FormationFormProps) => {
  const router = useRouter();
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const languages = relatedData?.languages || [];
  const branches = relatedData?.branches || [];
  const teachers = relatedData?.teachers || [];
  const defaultBranchId = relatedData?.defaultBranchId;

  // --- Form State for Create / Update ---
  const [selectedLanguageId, setSelectedLanguageId] = useState<number | "new">(
    languages[0]?.id || "new"
  );
  const [newLanguageName, setNewLanguageName] = useState("");
  const [branchId, setBranchId] = useState<number>(
    data?.branch?.id || data?.branchId || defaultBranchId || branches[0]?.id || 1
  );
  const [teacherId, setTeacherId] = useState<string>(
    data?.teacher?.id || data?.teacherId || ""
  );
  const [ageGroup, setAgeGroup] = useState<string>(
    data?.ageGroup || "Adultes (15+ ans)"
  );
  const [groupName, setGroupName] = useState<string>(data?.name || "");

  // Book fee settings (§1.2 & §2.11)
  const [hasBooks, setHasBooks] = useState<boolean>(data?.hasBooks || false);
  const [bookFee, setBookFee] = useState<number>(
    data?.bookFee ? Number(data.bookFee) : 2500
  );

  // Inscription fee
  const [inscriptionFee, setInscriptionFee] = useState<number>(
    data?.inscriptionFee ? Number(data.inscriptionFee) : 0
  );

  // Levels definition for create or update
  const [levels, setLevels] = useState<LevelInput[]>(() => {
    if (type === "update" && relatedData?.levels && relatedData.levels.length > 0) {
      return relatedData.levels.map((lvl) => ({
        id: lvl.id,
        name: lvl.name,
        lumpSumPrice: Number(lvl.lumpSumPrice || 0),
        levelNumber: lvl.levelNumber,
        isDeleted: false,
        enrollmentsCount: lvl.enrollmentsCount || 0,
      }));
    }
    return [
      { name: "Niveau 1 (A1)", lumpSumPrice: 12000 },
      { name: "Niveau 2 (A2)", lumpSumPrice: 12000 },
      { name: "Niveau 3 (B1)", lumpSumPrice: 15000 },
    ];
  });

  const handleAddLevel = () => {
    const activeLevels = levels.filter((l) => !l.isDeleted);
    const nextNum = activeLevels.length + 1;
    setLevels((prev) => [
      ...prev,
      {
        name: `Niveau ${nextNum}`,
        lumpSumPrice: prev[prev.length - 1]?.lumpSumPrice || 12000,
        isDeleted: false,
      },
    ]);
  };

  const handleRemoveLevel = (index: number) => {
    const lvl = levels[index];
    if (lvl.id) {
      if (!lvl.isDeleted && lvl.enrollmentsCount && lvl.enrollmentsCount > 0) {
        toast.error(
          locale === "ar"
            ? `لا يمكن حذف هذا المستوى لاحتوائه على (${lvl.enrollmentsCount}) تلاميذ مسجلين. يرجى إلغاء تسجيلهم أولاً.`
            : `Impossible de supprimer ce niveau car il contient ${lvl.enrollmentsCount} élève(s) inscrit(s). Désinscrivez-les d'abord.`
        );
        return;
      }
      // Toggle deletion for existing level
      setLevels((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, isDeleted: !item.isDeleted } : item
        )
      );
    } else {
      // New unsaved level: remove from array
      if (levels.filter((l) => !l.isDeleted).length <= 1) {
        toast.warning(t("minOneLevelWarning"));
        return;
      }
      setLevels((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleLevelChange = (
    index: number,
    field: keyof LevelInput,
    val: string | number
  ) => {
    setLevels((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: val,
      };
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (type === "update") {
        if (!groupName.trim()) {
          toast.error(t("groupNameRequired"));
          setIsSubmitting(false);
          return;
        }

        const activeLevels = levels.filter((l) => !l.isDeleted);
        if (activeLevels.length === 0) {
          toast.error(t("minOneLevelWarning"));
          setIsSubmitting(false);
          return;
        }

        if (activeLevels.some((lvl) => !lvl.name.trim() || lvl.lumpSumPrice < 0)) {
          toast.error(t("levelConfigIncomplete"));
          setIsSubmitting(false);
          return;
        }

        const res = await updateFormationWithLevels({
          id: Number(data.id),
          name: groupName.trim(),
          teacherId: teacherId || null,
          ageGroup: ageGroup.trim(),
          hasBooks,
          bookFee: hasBooks ? Number(bookFee) : null,
          levels: levels.map((lvl) => ({
            id: lvl.id,
            name: lvl.name.trim(),
            lumpSumPrice: Number(lvl.lumpSumPrice) || 0,
            isDeleted: !!lvl.isDeleted,
          })),
        });

        if (res.success) {
          toast.success(res.message);
          setOpen(false);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } else {
        // Create Mode
        const langName =
          selectedLanguageId === "new"
            ? newLanguageName.trim()
            : languages.find((l) => l.id === selectedLanguageId)?.name || "";

        if (!langName) {
          toast.error(t("langRequired"));
          setIsSubmitting(false);
          return;
        }

        if (levels.some((lvl) => !lvl.name.trim() || lvl.lumpSumPrice <= 0)) {
          toast.error(t("levelConfigIncomplete"));
          setIsSubmitting(false);
          return;
        }

        const res = await createFormationWithLevels({
          languageName: langName,
          languageId:
            selectedLanguageId === "new" ? undefined : Number(selectedLanguageId),
          levels: levels.map((lvl) => ({
            name: lvl.name.trim(),
            lumpSumPrice: Number(lvl.lumpSumPrice) || 0,
          })),
          branchId: Number(branchId),
          teacherId: teacherId || null,
          ageGroup: ageGroup.trim(),
          initialGroupName: groupName.trim() || undefined,
          hasBooks,
          bookFee: hasBooks ? Number(bookFee) : undefined,
          inscriptionFee: Number(inscriptionFee) || 0,
        });

        if (res.success) {
          toast.success(res.message);
          setOpen(false);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ غير متوقع.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-6 font-sans" onSubmit={handleSubmit}>
      <h1 className="text-section-title font-bold text-gray-900">
        {type === "create" ? t("createTitle") : t("updateTitle")}
      </h1>

      {type === "create" ? (
        <>
          {/* 1. LANGUAGE SELECTION */}
          <div className="flex flex-col gap-3">
            <span className="text-xs text-gray-500 font-medium border-b pb-1">
              {t("languageSection")}
            </span>
            <div className="flex justify-between flex-wrap gap-4">
              <div className="flex flex-col gap-2 w-full md:w-[48%]">
                <label className="text-xs text-gray-500">{t("selectLanguage")}</label>
                <select
                  value={selectedLanguageId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedLanguageId(val === "new" ? "new" : Number(val));
                  }}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
                >
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.name}
                    </option>
                  ))}
                  <option value="new">{t("addNewLanguage")}</option>
                </select>
              </div>

              {selectedLanguageId === "new" && (
                <div className="flex flex-col gap-2 w-full md:w-[48%]">
                  <label className="text-xs text-gray-500">{t("newLanguageName")}</label>
                  <input
                    type="text"
                    value={newLanguageName}
                    onChange={(e) => setNewLanguageName(e.target.value)}
                    placeholder={t("newLanguagePlaceholder")}
                    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
              )}
            </div>
          </div>

          {/* 2. GROUP & BRANCH DETAILS */}
          <div className="flex flex-col gap-3">
            <span className="text-xs text-gray-500 font-medium border-b pb-1">
              {t("groupBranchSection")}
            </span>
            <div className="flex justify-between flex-wrap gap-4">
              <div className="flex flex-col gap-2 w-full md:w-[30%]">
                <label className="text-xs text-gray-500">{t("branch")}</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(Number(e.target.value))}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2 w-full md:w-[30%]">
                <label className="text-xs text-gray-500">{t("teacher")}</label>
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">{t("unassignedTeacher")}</option>
                  {teachers.map((tItem) => (
                    <option key={tItem.id} value={tItem.id}>
                      {tItem.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2 w-full md:w-[30%]">
                <label className="text-xs text-gray-500">{t("ageGroup")}</label>
                <input
                  type="text"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  placeholder={t("ageGroupPlaceholder")}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="flex flex-col gap-2 w-full">
                <label className="text-xs text-gray-500">
                  {t("initialGroupName")}
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={t("groupDefaultPlaceholder")}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. BOOK FEES OPTION (§1.2 & §2.11) */}
          <div className="flex flex-col gap-3 p-3.5 rounded-lg border border-border bg-surface-subtle">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasBooks}
                onChange={(e) => setHasBooks(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300"
              />
              <span className="text-sm font-semibold text-gray-800">
                {t("hasBooksCheckbox")}
              </span>
            </label>

            {hasBooks && (
              <div className="flex flex-col gap-2 w-full md:w-1/3 pt-1">
                <label className="text-xs text-gray-500">
                  {t("bookFeeAmount")}
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={bookFee}
                  onChange={(e) => setBookFee(Number(e.target.value))}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none font-bold text-primary"
                  required={hasBooks}
                />
              </div>
            )}
          </div>

          {/* 4. DYNAMIC LEVELS DEFINITION (§1.8 & §2.8) */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs text-gray-500 font-medium">
                {t("levelsConfigSection")}
              </span>
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={handleAddLevel}
              >
                {t("addLevel")}
              </Button>
            </div>

            {levels.map((lvl, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-subtle border border-border"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                  {idx + 1}
                </div>

                <div className="flex-1 flex flex-col md:flex-row gap-3">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-xs text-gray-500">{t("levelName")}</label>
                    <input
                      type="text"
                      value={lvl.name}
                      onChange={(e) =>
                        handleLevelChange(idx, "name", e.target.value)
                      }
                      placeholder="Ex: Niveau 1 (A1)"
                      className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
                      required
                    />
                  </div>

                  <div className="w-full md:w-44 flex flex-col gap-1">
                    <label className="text-xs text-gray-500">
                      {t("lumpSumPriceLabel")}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={lvl.lumpSumPrice}
                      onChange={(e) =>
                        handleLevelChange(
                          idx,
                          "lumpSumPrice",
                          Number(e.target.value)
                        )
                      }
                      className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none font-bold text-success"
                      required
                    />
                  </div>
                </div>

                {levels.length > 1 && (
                  <Button
                    type="button"
                    variant="soft-danger"
                    size="sm"
                    onClick={() => handleRemoveLevel(idx)}
                    className="self-end mb-1"
                  >
                    {t("deleteLevel")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        /* UPDATE MODE */
        <div className="flex justify-between flex-wrap gap-4">
          <input type="hidden" name="id" value={data?.id} />

          <div className="flex flex-col gap-2 w-full">
            <label className="text-xs text-gray-500">{t("name")}</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
              required
            />
          </div>

          <div className="flex flex-col gap-2 w-full md:w-[48%]">
            <label className="text-xs text-gray-500">{t("teacher")}</label>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">{t("unassignedTeacher")}</option>
              {teachers.map((tItem) => (
                <option key={tItem.id} value={tItem.id}>
                  {tItem.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2 w-full md:w-[48%]">
            <label className="text-xs text-gray-500">{t("ageGroup")}</label>
            <input
              type="text"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none"
            />
          </div>

          {/* Book fee update */}
          <div className="flex flex-col gap-3 p-3.5 rounded-lg border border-border bg-surface-subtle w-full mt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasBooks}
                onChange={(e) => setHasBooks(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300"
              />
              <span className="text-sm font-semibold text-gray-800">
                {t("hasBooksCheckbox")}
              </span>
            </label>

            {hasBooks && (
              <div className="flex flex-col gap-2 w-full md:w-1/3 pt-1">
                <label className="text-xs text-gray-500">
                  {t("bookFeeAmount")}
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={bookFee}
                  onChange={(e) => setBookFee(Number(e.target.value))}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none font-bold text-primary"
                  required={hasBooks}
                />
              </div>
            )}
          </div>

          {/* Levels Section in Update Mode */}
          <div className="flex flex-col gap-3 w-full mt-2 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                {t("levelsConfigSection")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLevel}
              >
                + {t("addLevel")}
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {levels.map((lvl, idx) => {
                const isMarkedDeleted = !!lvl.isDeleted;
                return (
                  <div
                    key={lvl.id ? `id-${lvl.id}` : `new-${idx}`}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      isMarkedDeleted
                        ? "bg-red-50/70 border-red-200 opacity-60 line-through"
                        : "bg-surface-subtle border-border"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${
                        isMarkedDeleted
                          ? "bg-red-100 text-red-600"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {lvl.levelNumber || idx + 1}
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row gap-3">
                      <div className="flex-1 flex flex-col gap-1">
                        <label className="text-xs text-gray-500">{t("levelName")}</label>
                        <input
                          type="text"
                          value={lvl.name}
                          disabled={isMarkedDeleted}
                          onChange={(e) =>
                            handleLevelChange(idx, "name", e.target.value)
                          }
                          placeholder="Ex: Niveau 1 (A1)"
                          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none disabled:bg-gray-100"
                          required={!isMarkedDeleted}
                        />
                      </div>

                      <div className="w-full md:w-44 flex flex-col gap-1">
                        <label className="text-xs text-gray-500">
                          {t("lumpSumPriceLabel")}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="500"
                          disabled={isMarkedDeleted}
                          value={lvl.lumpSumPrice}
                          onChange={(e) =>
                            handleLevelChange(
                              idx,
                              "lumpSumPrice",
                              Number(e.target.value)
                            )
                          }
                          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] focus:ring-2 focus:ring-primary outline-none font-bold text-success disabled:bg-gray-100"
                          required={!isMarkedDeleted}
                        />
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant={isMarkedDeleted ? "outline" : "soft-danger"}
                      size="sm"
                      onClick={() => handleRemoveLevel(idx)}
                      className="self-end mb-1 shrink-0"
                    >
                      {isMarkedDeleted
                        ? (locale === "ar" ? "استرجاع" : "Restaurer")
                        : t("deleteLevel")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting
          ? type === "create"
            ? t("submittingCreate")
            : t("submittingUpdate")
          : type === "create"
          ? tCommon("create")
          : tCommon("update")}
      </Button>
    </form>
  );
};

export default FormationForm;
