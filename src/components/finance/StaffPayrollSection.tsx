"use client";

import React, { useState } from "react";
import { UserCheck, Users, Plus, DollarSign, CheckCircle2, Clock, Loader2, Phone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createStaffMemberAction, recordStaffPayrollAction } from "@/lib/financeActions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export interface StaffItem {
  id: number;
  name: string;
  roleTitle: string;
  phone?: string | null;
  branchId: number | null;
  branchName?: string;
  baseSalary: number;
  isActive: boolean;
}

export interface StaffPayrollItem {
  id: number;
  staffMemberId: number;
  staffName: string;
  roleTitle: string;
  month: number;
  year: number;
  amount: number;
  status: string;
  paidAt: string | Date | null;
  notes?: string | null;
}

interface StaffPayrollSectionProps {
  staffMembers: StaffItem[];
  payrollLogs: StaffPayrollItem[];
  branches: Array<{ id: number; name: string }>;
}

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export default function StaffPayrollSection({
  staffMembers,
  payrollLogs,
  branches,
}: StaffPayrollSectionProps) {
  const router = useRouter();

  // Modals
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);

  // New staff form
  const [staffName, setStaffName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [staffBranchId, setStaffBranchId] = useState<string>("all");
  const [baseSalary, setBaseSalary] = useState("");

  // Pay staff form
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [payrollAmount, setPayrollAmount] = useState<string>("");
  const [payrollNotes, setPayrollNotes] = useState<string>("");
  const [payrollStatus, setPayrollStatus] = useState<"PAID" | "PENDING">("PAID");

  const [isLoading, setIsLoading] = useState(false);

  const handleOpenPayModal = (staff?: StaffItem) => {
    if (staff) {
      setSelectedStaffId(String(staff.id));
      setPayrollAmount(String(staff.baseSalary || ""));
    } else if (staffMembers.length > 0) {
      setSelectedStaffId(String(staffMembers[0].id));
      setPayrollAmount(String(staffMembers[0].baseSalary || ""));
    }
    setSelectedMonth(new Date().getMonth() + 1);
    setSelectedYear(new Date().getFullYear());
    setPayrollNotes("");
    setPayrollStatus("PAID");
    setIsPayrollModalOpen(true);
  };

  const handleStaffChangeInPayModal = (idStr: string) => {
    setSelectedStaffId(idStr);
    const member = staffMembers.find((s) => String(s.id) === idStr);
    if (member && member.baseSalary > 0) {
      setPayrollAmount(String(member.baseSalary));
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !roleTitle.trim()) {
      toast.error("Veuillez renseigner le nom et le poste.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await createStaffMemberAction({
        name: staffName,
        roleTitle,
        phone,
        branchId: staffBranchId === "all" ? null : Number(staffBranchId),
        baseSalary: Number(baseSalary || 0),
      });

      if (res.success) {
        toast.success(res.message);
        setIsStaffModalOpen(false);
        setStaffName("");
        setRoleTitle("");
        setPhone("");
        setBaseSalary("");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !payrollAmount || Number(payrollAmount) <= 0) {
      toast.error("Veuillez sélectionner un employé et renseigner le montant.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await recordStaffPayrollAction({
        staffMemberId: Number(selectedStaffId),
        month: Number(selectedMonth),
        year: Number(selectedYear),
        amount: Number(payrollAmount),
        status: payrollStatus,
        notes: payrollNotes,
      });

      if (res.success) {
        toast.success(res.message);
        setIsPayrollModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  const totalMonthlyStaffPayroll = payrollLogs
    .filter((l) => l.status === "PAID")
    .reduce((sum, l) => sum + l.amount, 0);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Top Bar */}
      <Card className="p-4 border-border/80 shadow-xs bg-surface flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span>Gestion du Personnel & Salaires</span>
          </h3>
          <p className="text-form-helper text-muted">
            Total salaires décaissés enregistrés : <strong className="text-primary font-mono">{totalMonthlyStaffPayroll.toLocaleString("fr-FR")} DZD</strong>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsStaffModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-surface hover:bg-surface-muted text-gray-700 border border-border px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Personnel</span>
          </button>
          <button
            onClick={() => handleOpenPayModal()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
          >
            <DollarSign className="w-4 h-4" />
            <span>Enregistrer un Salaire</span>
          </button>
        </div>
      </Card>

      {/* Staff Members List */}
      <Card className="p-5 border-border/80 shadow-xs bg-surface">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          Membres du Personnel Actifs ({staffMembers.length})
        </h4>

        {staffMembers.length === 0 ? (
          <div className="p-6 text-center text-muted text-sm">
            Aucun membre du personnel enregistré. Cliquez sur &quot;Nouveau Personnel&quot; pour en ajouter.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {staffMembers.map((s) => (
              <div
                key={s.id}
                className="p-3.5 rounded-xl border border-border/60 bg-surface-muted/40 hover:bg-surface-muted transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-gray-900 text-sm">{s.name}</span>
                    <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {s.roleTitle}
                    </span>
                  </div>
                  {s.phone && (
                    <p className="text-2xs text-muted flex items-center gap-1 mt-1 font-mono">
                      <Phone className="w-3 h-3 text-muted" />
                      <span>{s.phone}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted mt-2 font-mono">
                    Salaire de base : <strong className="text-gray-900">{s.baseSalary.toLocaleString("fr-FR")} DZD</strong>
                  </p>
                  <p className="text-2xs text-muted mt-0.5">
                    Succursale : {s.branchName || "Toutes / Siège"}
                  </p>
                </div>

                <button
                  onClick={() => handleOpenPayModal(s)}
                  className="mt-3 w-full py-1.5 px-3 bg-surface hover:bg-primary/5 text-primary border border-primary/20 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  Payer ce mois
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Staff Payroll History */}
      <Card className="border-border/80 shadow-xs bg-surface overflow-hidden">
        <div className="p-4 border-b border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Historique des Salaires du Personnel
          </h4>
        </div>

        {payrollLogs.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            Aucun historique de paiement pour le personnel pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted border-b border-border text-xs font-semibold text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Période</th>
                  <th className="py-3 px-4">Employé(e)</th>
                  <th className="py-3 px-4">Fonction</th>
                  <th className="py-3 px-4 text-right">Montant</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4">Date de versement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {payrollLogs.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-subtle/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-gray-900 whitespace-nowrap">
                      {MONTH_NAMES[p.month - 1]} {p.year}
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      {p.staffName}
                      {p.notes && <span className="block text-2xs text-muted font-normal">{p.notes}</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted">{p.roleTitle}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                      {p.amount.toLocaleString("fr-FR")} DZD
                    </td>
                    <td className="py-3 px-4 text-center">
                      {p.status === "PAID" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-light text-success border border-success-soft">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Payé</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border">
                          <Clock className="w-3 h-3" />
                          <span>En attente</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted font-mono">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString("fr-FR") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Add Staff */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              <span>Nouveau membre du personnel</span>
            </h3>

            <form onSubmit={handleCreateStaff} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nom complet *</label>
                <input
                  type="text"
                  required
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="ex: Amina Benali"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Poste / Fonction *</label>
                <input
                  type="text"
                  required
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="ex: Secrétaire d'accueil, Agent d'entretien"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="ex: 0550123456"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Succursale</label>
                  <select
                    value={staffBranchId}
                    onChange={(e) => setStaffBranchId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="all">Toutes / Siège</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Salaire mensuel de base (DZD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  placeholder="ex: 35000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg font-medium cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enregistrer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pay Staff */}
      {isPayrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <span>Enregistrer un versement de salaire</span>
            </h3>

            <form onSubmit={handleRecordPayroll} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Employé(e) *</label>
                <select
                  required
                  value={selectedStaffId}
                  onChange={(e) => handleStaffChangeInPayModal(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">Sélectionner un employé...</option>
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.roleTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Mois</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Année</label>
                  <input
                    type="number"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Montant à verser (DZD) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payrollAmount}
                  onChange={(e) => setPayrollAmount(e.target.value)}
                  placeholder="ex: 35000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Statut</label>
                  <select
                    value={payrollStatus}
                    onChange={(e) => setPayrollStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="PAID">Payé (PAID)</option>
                    <option value="PENDING">En attente (PENDING)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Notes (Optionnel)</label>
                  <input
                    type="text"
                    value={payrollNotes}
                    onChange={(e) => setPayrollNotes(e.target.value)}
                    placeholder="ex: Bonus inclus"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsPayrollModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg font-medium cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enregistrer le versement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
