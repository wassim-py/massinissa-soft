import React from "react";

export function isFemaleGender(gender?: string | null): boolean {
  if (!gender) return false;
  const g = gender.trim().toUpperCase();
  return g === "FEMALE" || g === "F" || g === "WOMAN" || g === "GIRL";
}

export function getTeacherAvatarSrc(gender?: string | null): string {
  return isFemaleGender(gender)
    ? "/avatars/teacher-female.svg"
    : "/avatars/teacher-male.svg";
}

export function getStudentAvatarSrc(gender?: string | null): string {
  return isFemaleGender(gender)
    ? "/avatars/student-female.svg"
    : "/avatars/student-male.svg";
}

export interface AvatarProps {
  gender?: string | null;
  size?: number;
  className?: string;
  alt?: string;
}

export interface UserAvatarProps extends AvatarProps {
  type: "teacher" | "student" | "parent" | "admin";
}

export const TeacherAvatar: React.FC<AvatarProps> = ({
  gender,
  size = 88,
  className = "",
  alt,
}) => {
  const isFemale = isFemaleGender(gender);
  // Darker icon color on top of soft comfortable pastel background
  const strokeColor = isFemale ? "#BE185D" : "#1D4ED8";
  const bgColor = isFemale ? "#FCE7F3" : "#DBEAFE";
  const borderColor = isFemale ? "#FBCFE8" : "#BFDBFE";
  const label = alt || (isFemale ? "Woman Teacher" : "Man Teacher");

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`rounded-full shrink-0 select-none ${className}`}
    >
      <circle cx="50" cy="50" r="48" fill={bgColor} stroke={borderColor} strokeWidth="2" />
      {isFemale ? (
        /* Simple Woman Teacher Icon: Hair Bun, Feminine Hair Framing, Glasses, Torso with V-Collar */
        <g>
          <circle cx="50" cy="15" r="7" fill={strokeColor} />
          <circle cx="50" cy="36" r="16" stroke={strokeColor} strokeWidth="4" fill="none" />
          <path
            d="M35 37 C35 24 41 21 50 21 C59 21 65 24 65 37"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <rect x="38" y="32" width="10" height="8" rx="2.5" stroke={strokeColor} strokeWidth="3" fill="none" />
          <rect x="52" y="32" width="10" height="8" rx="2.5" stroke={strokeColor} strokeWidth="3" fill="none" />
          <line x1="48" y1="36" x2="52" y2="36" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
          <path
            d="M22 84 C22 66 34 60 50 60 C66 60 78 66 78 84"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M43 60 L50 70 L57 60"
            stroke={strokeColor}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      ) : (
        /* Simple Man Teacher Icon: Neat Hair with Parting, Glasses, Torso with Tie & Collar */
        <g>
          <circle cx="50" cy="36" r="16" stroke={strokeColor} strokeWidth="4" fill="none" />
          <path
            d="M34 33 C34 20 42 19 50 19 C58 19 66 21 66 33"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M34 28 C39 23 48 23 52 25"
            stroke={strokeColor}
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          <rect x="38" y="32" width="10" height="8" rx="2" stroke={strokeColor} strokeWidth="3" fill="none" />
          <rect x="52" y="32" width="10" height="8" rx="2" stroke={strokeColor} strokeWidth="3" fill="none" />
          <line x1="48" y1="36" x2="52" y2="36" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
          <path
            d="M22 84 C22 66 34 60 50 60 C66 60 78 66 78 84"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M43 60 L50 66 L57 60"
            stroke={strokeColor}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <polygon points="47.5,66 52.5,66 54,82 50,86 46,82" fill={strokeColor} />
        </g>
      )}
    </svg>
  );
};

export const StudentAvatar: React.FC<AvatarProps> = ({
  gender,
  size = 100,
  className = "",
  alt,
}) => {
  const isFemale = isFemaleGender(gender);
  // Darker icon color on top of soft comfortable pastel background
  const strokeColor = isFemale ? "#BE185D" : "#1D4ED8";
  const bgColor = isFemale ? "#FCE7F3" : "#DBEAFE";
  const borderColor = isFemale ? "#FBCFE8" : "#BFDBFE";
  const label = alt || (isFemale ? "Girl Student" : "Boy Student");

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`rounded-full shrink-0 select-none ${className}`}
    >
      <circle cx="50" cy="50" r="48" fill={bgColor} stroke={borderColor} strokeWidth="2" />
      {isFemale ? (
        /* Simple Girl Student Icon: Twin Pigtails with Ribbons, Bangs, Torso with Student Collar */
        <g>
          <path d="M30 33 C20 33 20 46 26 53 C29 50 31 43 31 33 Z" fill={strokeColor} />
          <path d="M70 33 C80 33 80 46 74 53 C71 50 69 43 69 33 Z" fill={strokeColor} />
          <circle cx="29" cy="35" r="3" fill="#FCE7F3" stroke={strokeColor} strokeWidth="2" />
          <circle cx="71" cy="35" r="3" fill="#FCE7F3" stroke={strokeColor} strokeWidth="2" />
          <circle cx="50" cy="36" r="16" stroke={strokeColor} strokeWidth="4" fill="none" />
          <path
            d="M34 35 C34 22 42 20 50 20 C58 20 66 22 66 35"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M38 27 C43 28 48 33 50 36" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M62 27 C57 28 52 33 50 36" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path
            d="M24 84 C24 67 35 61 50 61 C65 61 76 67 76 84"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M40 61 C40 69 50 69 50 64" stroke={strokeColor} strokeWidth="3.5" fill="none" />
          <path d="M60 61 C60 69 50 69 50 64" stroke={strokeColor} strokeWidth="3.5" fill="none" />
        </g>
      ) : (
        /* Simple Boy Student Icon: Hair with Tuft, Torso with Crewneck Collar */
        <g>
          <circle cx="50" cy="36" r="16" stroke={strokeColor} strokeWidth="4" fill="none" />
          <path
            d="M34 34 C34 21 42 19 50 19 C58 19 66 22 66 34"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M44 19 C47 13 53 14 52 19" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M37 30 C43 24 53 25 59 28" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path
            d="M24 84 C24 67 35 61 50 61 C65 61 76 67 76 84"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M42 61 C42 68 58 68 58 61" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </g>
      )}
    </svg>
  );
};

export const UserAvatar: React.FC<UserAvatarProps> = ({ type, ...props }) => {
  if (type === "teacher") return <TeacherAvatar {...props} />;
  return <StudentAvatar {...props} />;
};

export default UserAvatar;
