import { FieldError } from "react-hook-form";

type InputFieldProps = {
  label: string;
  type?: string;
  register: any;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  error?: FieldError;
  hidden?: boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  className?: string;
};

const InputField = ({
  label,
  type = "text",
  register,
  name,
  defaultValue,
  placeholder,
  error,
  hidden,
  inputProps,
  className,
}: InputFieldProps) => {
  return (
    <div className={hidden ? "hidden" : className ? `flex flex-col gap-1.5 ${className}` : "flex flex-col gap-1.5 w-full md:w-1/4"}>
      <label className="text-form-label text-gray-700 select-none">{label}</label>
      <input
        type={type}
        {...register(name)}
        className={`w-full px-3 py-2 text-table-body rounded-lg border bg-surface text-gray-800 placeholder:text-muted-light shadow-xs focus:outline-none focus:ring-2 transition-colors ${
          error
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-border focus:border-primary focus:ring-primary/20"
        }`}
        placeholder={placeholder}
        {...inputProps}
        defaultValue={defaultValue}
      />
      {error?.message && (
        <p className="text-form-helper text-danger font-medium">{error.message.toString()}</p>
      )}
    </div>
  );
};

export default InputField;
