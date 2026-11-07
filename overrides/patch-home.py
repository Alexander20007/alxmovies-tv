"""Aplica a nova tela inicial no Home.tsx do projeto (atalhos + Top 10).
Cada troca confere que o texto original existe exatamente uma vez; se não existir, para com erro
(assim nada é gravado por cima de um Home.tsx diferente do esperado)."""
import sys

p = sys.argv[1]
s = open(p, encoding="utf-8").read()


def rep(a, b):
    global s
    n = s.count(a)
    if n != 1:
        sys.exit(f"✗ Home.tsx diferente do esperado ({n} ocorrências de: {a[:70]!r})")
    s = s.replace(a, b)


rep('import { HeroCarousel } from "@/components/HeroCarousel";\n',
    'import { HeroCarousel } from "@/components/HeroCarousel";\nimport { Icon, type IconName } from "@/components/Icon";\n')
rep('function QueryRow({ title, queryKey, fn, ranked, type = "movie" }: {\n'
    '  title: string; queryKey: unknown[]; fn: () => Promise<{ results: MediaItem[] }>; ranked?: boolean; type?: MediaType;\n}) {',
    'function QueryRow({ title, queryKey, fn, ranked, limit, type = "movie" }: {\n'
    '  title: string; queryKey: unknown[]; fn: () => Promise<{ results: MediaItem[] }>; ranked?: boolean; limit?: number; type?: MediaType;\n}) {')
rep('  return <MediaRow title={title} items={filterForProfile(q.data?.results ?? [], activeProfile)} ranked={ranked} type={type} />;\n}',
    '  const items = filterForProfile(q.data?.results ?? [], activeProfile);\n'
    '  return <MediaRow title={title} items={limit ? items.slice(0, limit) : items} ranked={ranked} type={type} />;\n}')
CHIPS = '''/** Atalhos logo abaixo do destaque: salas, amigos, minha lista e canais ao vivo. */
function QuickChips({ kids }: { kids: boolean }) {
  const navigate = useNavigate();
  const { openPanel } = useChannelsUi();
  const chips: { icon: IconName; label: string; go: () => void }[] = [
    { icon: "film", label: "Salas", go: () => navigate("/salas") },
    { icon: "users", label: "Amigos", go: () => navigate("/amigos") },
    { icon: "bookmark", label: "Minha lista", go: () => navigate("/mylist") },
    ...(!kids ? [{ icon: "tv" as IconName, label: "Canais ao vivo", go: openPanel }] : []),
  ];
  return (
    <nav className="hx-chips" aria-label="Atalhos">
      {chips.map((c) => (
        <button key={c.label} type="button" className="hx-chip" onClick={c.go}>
          <Icon name={c.icon} size={18} /> {c.label}
        </button>
      ))}
    </nav>
  );
}

export default function Home() {'''
rep('export default function Home() {', CHIPS)
rep('      {heroes.length > 0 && <HeroCarousel items={heroes} />}\n      <main id="rows-container">',
    '      {heroes.length > 0 && <HeroCarousel items={heroes} />}\n'
    '      <QuickChips kids={!!activeProfile?.is_kids} />\n'
    '      <main id="rows-container" className="home-v2">')
rep('<QueryRow title="Em alta esta semana" queryKey={["trending", "week"]} fn={() => tmdb.trending("movie", "week")} ranked />',
    '<QueryRow title="🏆 Top 10 da semana" queryKey={["trending", "week"]} fn={() => tmdb.trending("movie", "week")} ranked limit={10} />')
open(p, "w", encoding="utf-8").write(s)
print("✓ Home.tsx atualizado")
