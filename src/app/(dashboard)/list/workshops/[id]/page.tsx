import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import Image from "next/image";
import WorkshopRoster from "@/components/WorkshopRoster";
import FormContainer from "@/components/FormContainer";
import WorkshopSchedule from "@/components/WorkshopSchedule";
import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";



const WorkshopDetailsPage = async (props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const { sessionClaims } = await auth();
    const role = (sessionClaims?.metadata as { role?: string })?.role;

    // This page is for Admins
    if (role !== 'admin') {
        return <div className="p-4 text-4xl">للمزيد من المعلومات حول هذه الدورة والتسجيل فيها، يرجى الاتصال بمدرستك.</div>;
    }

    const workshopId = parseInt(params.id);

    // UPDATED: The query now includes refund records for each workshop payment
    const workshop = await prisma.workshop.findUnique({
      where: { id: workshopId },
      include: {
        sessions: {
          orderBy: { startTime: 'asc' },
          include: {
              attendances: true, 
          }
        },
        participants: {
          orderBy: { name: 'asc' },
          include: {
              payments: {
                  orderBy: { date: 'desc' },
                  // MODIFIED: Include the refunds for each payment
                  include: {
                      refunds: {
                          select: {
                              amount: true
                          }
                      }
                  }
              },
              attendances: true,
          }
        },
      },
    });

    if (!workshop) {
      notFound();
    }

    return (
      <div className="p-4 md:p-6 space-y-8">
        <BackButton />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
              <h1 className="text-3xl font-bold">{workshop.title}</h1>
              <p className="text-gray-500 mt-1">
                  تدرس من طرف: <span className="font-medium text-gray-700">{workshop.teacherName}</span>
              </p>
          </div>
          <ExportButton
          type="workshop_details"
          options={{ workshopId: workshop.id }}/>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
              <WorkshopRoster workshop={workshop as any} participants={workshop.participants as any} />
          </div>

          <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">التفاصيل</h3>
                  <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                          <span className="text-gray-500">السعر:</span>
                          <span className="font-medium">DZD{workshop.price.toFixed()}</span>
                      </div>
                      <div className="pt-2">
                          <p className="text-gray-500 mb-1">الوصف:</p>
                          <p className="text-gray-700">{workshop.description}</p>
                      </div>
                  </div>
              </div>
              <WorkshopSchedule 
                  workshop={workshop}
                  sessions={workshop.sessions}
                  participants={workshop.participants}
              />
          </div>
        </div>
      </div>
    );
};

export default WorkshopDetailsPage;
