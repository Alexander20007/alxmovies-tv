import { useStaffDirectory } from "@/hooks/useStaffDirectory";

/** Selo de verificado (como Instagram/Facebook), azul com o visto branco. */
export function VerifiedBadge({ title = "Admin verificado" }: { title?: string }) {
  return (
    <svg className="vbadge" viewBox="0 0 24 24" role="img" aria-label={title}>
      <title>{title}</title>
      <path fill="#1d9bf0" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z" />
      <path fill="#fff" d="m9.13 16.75-3.5-3.5 1.06-1.06 2.44 2.44 5.88-5.88 1.06 1.06z" />
    </svg>
  );
}

/** "Admin João": primeiro nome da pessoa depois da palavra Admin (sem repetir se o nome já começa com Admin). */
export function staffLabel(name: string): string {
  const first = name.trim().replace(/^(admin|administrador)\s+/i, "").split(/\s+/)[0] ?? "";
  return `Admin ${first}`.trim();
}

/** Nome de uma pessoa: se ela é admin, vira "Admin Nome" com o selo. Passe o id do perfil e/ou da conta. */
export function StaffName({ name, profileId, userId }: { name: string; profileId?: string | null; userId?: string | null }) {
  const dir = useStaffDirectory();
  const staff = (!!profileId && dir.profiles.has(profileId)) || (!!userId && dir.users.has(userId));
  if (!staff) return <>{name}</>;
  return <>{staffLabel(name)}<VerifiedBadge /></>;
}
