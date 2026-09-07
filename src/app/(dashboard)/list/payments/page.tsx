import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";
import { Prisma, Student } from "@prisma/client";
import ChildSwitcher from "@/components/ChildSwitcher";
import PageHeader from "@/components/PageHeader";



// Helper component for the financial summary cards
const FinancialStatCard = ({ label, value, icon, color }: { label: string, value: string, icon: string, color: string }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border flex items-start gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
            <Image src={icon} alt={label} width={24} height={24} />
        </div>
        <div>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
            <p className="text-sm text-gray-500">{label}</p>
        </div>
    </div>
);

// UPDATED: TransactionHistory component now handles a unified transaction type
const TransactionHistory = ({ transactions }: { transactions: any[] }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-bold text-gray-800 mb-4">سجل المعاملات</h2>
        <div className="space-y-3">
            {transactions.length > 0 ? (
                transactions.map(tx => (
                    <div key={`${tx.type}-${tx.id}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                        <div>
                            <p className={`font-semibold ${tx.isRefund ? 'text-red-600' : 'text-gray-700'}`}>
                                {tx.isRefund ? 'عملية استرجاع' : 'عملية دفع'} لـ {tx.description}
                            </p>
                            <p className="text-xs text-gray-500">
                                {new Date(tx.date).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                        <p className={`font-bold text-lg ${tx.isRefund ? 'text-red-600' : 'text-green-600'}`}>
                            {tx.isRefund ? '-' : '+'}
                            {tx.amount.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}
                        </p>
                    </div>
                ))
            ) : (
                <p className="text-center text-gray-500 py-4">لا توجد أي معاملات مسجلة.</p>
            )}
        </div>
    </div>
);


const PaymentsListPage = async (props: { searchParams: Promise<{ studentId?: string, search?: string }> }) => {
    const searchParams = await props.searchParams;
    const { userId, sessionClaims } = await auth();
    const role = (sessionClaims?.metadata as { role?: string })?.role;
    const currentUserId = userId;

    if (role === 'teacher') {
      return (
          <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
              <p className="text-red-600">ليس لديك صلاحية للوصول إلى هذه الصفحة.</p>
          </div>
      );
    }

    // Render the Student/Parent Financial Summary View
    if (role === 'student' || role === 'parent') {
        let activeStudentId: string | undefined = undefined;
        let children: Student[] = [];

        if (role === 'student') {
            activeStudentId = currentUserId!;
        } else { // role is 'parent'
            children = await prisma.student.findMany({
                where: { parentId: currentUserId! },
                orderBy: { name: 'asc' },
            });

            activeStudentId = searchParams.studentId;
            if (!activeStudentId) {
                activeStudentId = children[0]?.id;
            }
        }

        const studentData = activeStudentId ? await prisma.student.findUnique({
            where: { id: activeStudentId },
            include: {
                payments: { 
                    include: { class: true, refunds: true },
                    orderBy: { date: 'desc' } 
                },
                classes: true,
            }
        }) : null;

        const workshopPayments = (activeStudentId && studentData?.email) ? await prisma.workshopPayment.findMany({
            where: { participant: { email: studentData.email } },
            include: { workshop: true, refunds: true },
            orderBy: { date: 'desc' }
        }) : [];

        // --- Reworked transaction logic ---
        const allPaymentsRaw = [
            ...(studentData?.payments || []).map(p => ({ ...p, type: 'Class', description: p.class.name })),
            ...workshopPayments.map(p => ({ ...p, type: 'Workshop', description: p.workshop.title }))
        ];

        // De-duplicate the payments array to prevent processing the same payment multiple times
        const uniquePayments = Array.from(new Map(allPaymentsRaw.map(p => [p.id, p])).values());

        const allTransactions: any[] = [];
        // Process the *unique* payments array
        uniquePayments.forEach(p => {
            // Add the payment itself as an income transaction
            allTransactions.push({
                id: `payment-${p.id}`,
                type: p.type,
                description: p.description,
                date: p.date,
                amount: p.amount,
                isRefund: false,
            });
            // Add any associated refunds as outcome transactions
            p.refunds.forEach(r => {
                allTransactions.push({
                    id: `refund-${r.id}`,
                    type: `${p.type} Refund`,
                    description: p.description,
                    date: r.date,
                    amount: r.amount,
                    isRefund: true,
                });
            });
        });

        // Sort all transactions by date
        allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // --- Corrected Calculation Logic ---
        const totalPaid = allTransactions
            .filter(tx => !tx.isRefund)
            .reduce((sum, tx) => sum + tx.amount, 0);

        // *** FIX: This now correctly filters for transactions where isRefund is TRUE. ***
        const totalRefunded = allTransactions
            .filter(tx => tx.isRefund)
            .reduce((sum, tx) => sum + tx.amount, 0);

        const netPaid = totalPaid - totalRefunded;

        const lastPayment = allTransactions.find(tx => !tx.isRefund);

        const totalClassCost = studentData?.classes.reduce((sum, c) => sum + c.price, 0) || 0;
        const studentWorkshops = (activeStudentId && studentData?.email) ? await prisma.workshop.findMany({
            where: { participants: { some: { email: studentData.email } } }
        }) : [];
        const totalWorkshopCost = studentWorkshops.reduce((sum, w) => sum + w.price, 0);
        const totalCost = totalClassCost + totalWorkshopCost;
        const outstandingBalance = totalCost > netPaid ? totalCost - netPaid : 0;

        return (
            <div className="p-4 md:p-6">
                {role === 'parent' && (
                    <div className="mb-6">
                        <ChildSwitcher students={children} activeStudentId={activeStudentId} />
                    </div>
                )}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold">الملخص المالي</h1>
                    <p className="text-gray-500 mt-1">نظرة عامة على سجل مدفوعاتك وحالتها.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <FinancialStatCard label="المبلغ المدفوع حتى الآن" value={netPaid.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })} icon="/finance.png" color="bg-green-100" />
                    <FinancialStatCard label="المبلغ المسترجع حتى الآن" value={totalRefunded.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })} icon="/close.png" color="bg-red-100" />
                    <FinancialStatCard label="تاريخ آخر دفع" value={lastPayment ? new Date(lastPayment.date).toLocaleDateString('ar-DZ') : 'لا يوجد'} icon="/date.png" color="bg-blue-100" />
                </div>

                <TransactionHistory transactions={allTransactions} />
            </div>
        )
    }


    // RENDER ADMIN VIEW (Class List)
    const { search } = searchParams;
    const whereClause: Prisma.ClassWhereInput = {};

    if (search) {
        whereClause.name = {
            contains: search,
            mode: 'insensitive'
        }
    }

    const classes = await prisma.class.findMany({
      where: whereClause,
      include: {
        _count: {
          select: { students: true },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return (
      <div className="p-4 md:p-6">
        <PageHeader
          title="سجلات الدفع"
          searchPlaceholder="ابحث عن قسم..."
          createAction={null}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
          {classes.map((classItem) => (
            <Link
              href={`/list/payments/class/${classItem.id}`}
              key={classItem.id}
              className="block bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-400 transition-all duration-200"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-green-100 p-3 rounded-full">
                  <Image src="/finance.png" alt="finance icon" width={24} height={24} />
                </div>
                <h2 className="text-xl font-bold text-gray-800">{classItem.name}</h2>
              </div>
              <div className="text-sm space-y-2 text-gray-600">
                <p>
                  <strong>السعر (4 حصص):</strong> DZD{classItem.price.toFixed()}
                </p>
                <p>
                  <strong>التلاميذ:</strong> {classItem._count.students}
                </p>
              </div>
            </Link>
          ))}
           {classes.length === 0 && (
            <p className="col-span-full text-center text-gray-500 py-8">
              {search ? `لم يتم العثور على أي قسم يسمى بـ "${search}".` : "لم يتم العثور على أي قسم."}
            </p>
          )}
        </div>
      </div>
    );
};

export default PaymentsListPage;
