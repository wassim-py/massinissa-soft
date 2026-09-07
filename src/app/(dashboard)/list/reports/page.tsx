import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { arDZ } from "date-fns/locale";
import Image from "next/image";
import Link from "next/link";



// Helper component for styling the summary cards
const ReportCard = ({ title, amount, colorClass, icon }: { title: string, amount: number, colorClass:string, icon: string }) => (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex flex-col justify-between">
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100">
                <Image src={icon} alt={title} width={20} height={20} />
            </div>
            <h3 className="text-md font-semibold text-gray-600">{title}</h3>
        </div>
        <p className={`text-3xl font-bold mt-4 text-right ${colorClass}`}>
            {amount.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}
        </p>
    </div>
);

// Helper component for the transaction tables
const TransactionsTable = ({ title, transactions, type }: { title: string, transactions: any[], type: 'income' | 'outcome' }) => (
    <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-gray-600">
                    <tr className="border-b border-gray-200">
                        <th className="p-3 font-semibold">التاريخ</th>
                        <th className="p-3 font-semibold">المصدر</th>
                        <th className="p-3 font-semibold">ملاحظات</th>
                        <th className="p-3 font-semibold text-right">المبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.length > 0 ? (
                        transactions.map(t => (
                            <tr key={`${t.id}-${type}`} className="border-b border-gray-200 even:bg-slate-50 hover:bg-gray-100">
                                <td className="p-3">{format(new Date(t.date), 'yyyy LLLL d, H:mm', { locale: arDZ})}</td>
                                <td className="p-3">
                                    <div className="flex flex-col">
                                        {/* UPDATED: Logic to display source based on transaction type */}
                                        {type === 'income' ? (
                                            <>
                                                <span className="font-medium">{t.student ? `${t.student.name} ${t.student.surname}` : t.participant?.name || 'لا يوجد'}</span>
                                                <span className="text-xs text-gray-500">{t.class?.name || t.workshop?.title || ''}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="font-medium">{t.payment?.student ? `${t.payment.student.name} ${t.payment.student.surname}` : t.workshopPayment?.participant?.name || 'لا يوجد'}</span>
                                                <span className="text-xs text-gray-500">{t.payment?.class?.name || t.workshopPayment?.workshop?.title || ''}</span>
                                            </>
                                        )}
                                    </div>
                                </td>
                                <td className="p-3 text-gray-500">{t.notes || 'لا توجد'}</td>
                                <td className="p-3 text-right font-medium">{t.amount.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={4} className="p-4 text-center text-gray-500">لا توجد معاملات خلال هذه الفترة.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);


// The main page component
const FinancialReportPage = async (
    props: { searchParams: Promise<{ dateFrom?: string, dateTo?: string, classId?: string, workshopId?: string }> }
) => {
    const searchParams = await props.searchParams;

    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate());

    let dateFromStr: string;
    let dateToStr: string;

    if (searchParams.dateFrom && !searchParams.dateTo) {
        dateFromStr = searchParams.dateFrom;
        dateToStr = searchParams.dateFrom;
    } else if (searchParams.dateFrom && searchParams.dateTo) {
        dateFromStr = searchParams.dateFrom;
        dateToStr = searchParams.dateTo;
    } else {
        dateFromStr = sevenDaysAgo.toISOString().split('T')[0];
        dateToStr = today.toISOString().split('T')[0];
    }

    const startOfRange = new Date(dateFromStr);
    startOfRange.setHours(0, 0, 0, 0);

    const endOfRange = new Date(dateToStr);
    endOfRange.setHours(23, 59, 59, 999);

    const classId = searchParams.classId;
    const workshopId = searchParams.workshopId;
    const formKey = `${dateFromStr}-${dateToStr}-${classId || 'all'}-${workshopId || 'all'}`;

    const [classes, workshops] = await prisma.$transaction([
        prisma.class.findMany({ orderBy: { name: 'asc' } }),
        prisma.workshop.findMany({ orderBy: { title: 'asc' } })
    ]);

    const paymentWhereClause = { ...(classId && { classId: parseInt(classId) }) };
    const workshopPaymentWhereClause = { ...(workshopId && { workshopId: parseInt(workshopId) }) };

    // Fetch transactions based on the date range and filters
    const [incomePayments, incomeWorkshopPayments, outcomeRefunds] = await Promise.all([
        // INCOME: All payments CREATED within the date range.
        !workshopId ? prisma.payment.findMany({ where: { date: { gte: startOfRange, lte: endOfRange }, ...paymentWhereClause }, include: { student: true, class: true } }) : Promise.resolve([]),
        !classId ? prisma.workshopPayment.findMany({ where: { date: { gte: startOfRange, lte: endOfRange }, ...workshopPaymentWhereClause }, include: { participant: true, workshop: true } }) : Promise.resolve([]),
        
        // OUTCOME: All REFUNDS created within the date range.
        prisma.refund.findMany({
            where: {
                date: { gte: startOfRange, lte: endOfRange },
                // Apply filters based on the nested relation
                ...(classId && { payment: { classId: parseInt(classId) } }),
                ...(workshopId && { workshopPayment: { workshopId: parseInt(workshopId) } }),
            },
            include: {
                payment: { include: { student: true, class: true } },
                workshopPayment: { include: { participant: true, workshop: true } },
            },
        }),
    ]);

    const allIncomeTransactions = [...incomePayments, ...incomeWorkshopPayments];

    const filteredIncome = allIncomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const filteredOutcome = outcomeRefunds.reduce((sum, t) => sum + t.amount, 0);
    const filteredNetTotal = filteredIncome - filteredOutcome;

    allIncomeTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    outcomeRefunds.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
            <BackButton/>
            {/* TOP */}
            <div className="flex flex-col md:flex-row items-start justify-between mb-6 border-b pb-4">
                <h2 className="text-3xl font-bold text-gray-800 mt-3">التقرير المالي</h2>
                <form key={formKey} className="grid grid-cols-2 md:flex items-end gap-2 mt-4 md:mt-0 w-full md:w-auto">
                    <div className="flex flex-col">
                        <label htmlFor="dateFrom" className="text-xs font-medium text-gray-500">من</label>
                        <input type="date" id="dateFrom" name="dateFrom" defaultValue={dateFromStr} className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="dateTo" className="text-xs font-medium text-gray-500">الى</label>
                        <input type="date" id="dateTo" name="dateTo" defaultValue={dateToStr} className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="classId" className="text-xs font-medium text-gray-500">القسم</label>
                        <select name="classId" id="classId" defaultValue={classId} className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">كل الاقسام</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="workshopId" className="text-xs font-medium text-gray-500">الدورات</label>
                        <select name="workshopId" id="workshopId" defaultValue={workshopId} className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">كل الدورات</option>
                            {workshops.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
                        </select>
                    </div>
                    <div className="flex col-span-2 md:col-auto gap-2">
                        <Link href="/list/reports" className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-md transition-colors text-sm w-full text-center">مسح</Link>
                        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors text-sm w-full">تصفية</button>
                    </div>
                    <ExportButton type="financial_report"
                        options={{
                        dateFrom: searchParams.dateFrom,
                        dateTo: searchParams.dateTo,
                        classId: searchParams.classId ? parseInt(searchParams.classId, 10) : undefined,
                        workshopId: searchParams.workshopId ? parseInt(searchParams.workshopId, 10) : undefined,
                    }}/>
                </form>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ReportCard title="المداخيل" amount={filteredIncome} colorClass="text-green-600" icon="/finance.png" />
                <ReportCard title="المسترجع" amount={filteredOutcome} colorClass="text-red-600" icon="/delete.png" />
                <ReportCard title="المجموع الصافي" amount={filteredNetTotal} colorClass={ filteredNetTotal >= 0 ? 'text-blue-600' : 'text-red-600' } icon="/sort.png" />
            </div>
            
            {/* Transaction Details */}
            <TransactionsTable title="المعاملات الدّاخلة" transactions={allIncomeTransactions} type="income" />
            <TransactionsTable title="المعاملات المسترجعة" transactions={outcomeRefunds} type="outcome" />
        </div>
    );
};

export default FinancialReportPage;
