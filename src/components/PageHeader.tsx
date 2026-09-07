import BackButton from "./BackButton";
import TableSearch from "./TableSearch";
import FormContainer from "./FormContainer";

type PageHeaderProps = {
  title: string;
  searchPlaceholder: string;
  createAction: {
    table: any; // Use a more specific type if you have one for table names
    type: 'create';
  } | null;
};

const PageHeader = ({ title, searchPlaceholder, createAction }: PageHeaderProps) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 border-b pb-4">
      <div>
        <BackButton />
        <h1 className="text-3xl font-bold mt-2">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <TableSearch placeholder={searchPlaceholder} />
        {createAction && (
          <FormContainer 
            table={createAction.table} 
            type={createAction.type} 
          />
        )}
      </div>
    </div>
  );
};

export default PageHeader;
