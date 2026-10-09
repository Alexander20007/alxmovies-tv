import { useState } from "react";
import type { Profile } from "@/types";

export function ProfileAvatar({ profile, badge }: { profile: Profile; badge?: string }) {
  const [broken, setBroken] = useState(false);
  const showImg = profile.avatar && !broken;
  return (
    <div className="profile-avatar" style={showImg ? undefined : { background: profile.color_theme || "#333" }}>
      {showImg
        ? <img src={profile.avatar!} alt={profile.name} onError={() => setBroken(true)} />
        : (profile.name || "?").trim().charAt(0).toUpperCase()}
      {badge && <span className={badge === "KIDS" ? "kids-badge" : "edit-badge"}>{badge === "KIDS" ? "KIDS" : badge}</span>}
    </div>
  );
}
