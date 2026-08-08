// Funções puras do motor ship.mjs — sem efeitos colaterais, testáveis isoladamente.
// ship.mjs importa daqui; os testes em ship/bin/lib.test.mjs cobrem os contratos.
import { closeSync, constants, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![\s\S])/;

export function isValidSemVer(value) {
  return typeof value === "string" && SEMVER_RE.test(value);
}

export function slugify(title) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export function flagValue(argv, name) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

// Extrai o número da issue/PR do fim da URL retornada pelo gh (defensivo:
// só retorna se numérico; o chamador decide o erro). Retorna string ou null.
export function extractIssueNumber(url) {
  const tail = (url ?? "").trim().split("/").pop() ?? "";
  const n = tail.replace(/[?#].*$/, "");
  return /^\d+$/.test(n) ? n : null;
}

// Parse da versão servida a partir do HTML: remove comentários, procura
// v(X.Y.Z[-prerelease][+build]) a partir do texto âncora "Versão da aplicação"
// (se presente) senão a primeira ocorrência. Retorna a versão ou null.
export function extractServedVersion(html) {
  let text = (html ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const anchor = text.indexOf("Versão da aplicação");
  if (anchor !== -1) text = text.slice(anchor);
  return (text.match(/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)(?=$|[^\p{L}\p{N}_+.-]|\.(?=$|[^\p{L}\p{N}_+.-]))/u) || [])[1] ?? null;
}


// Resolve a lista de schema watch do manifesto. Campo omitido (undefined/null)
// → default legado ["src/lib/db.ts"] (manifestos antigos não perdem o aviso);
// lista explícita → usa-a (inclusive [] para desligar o aviso).
export function resolveSchemaWatch(value) {
  if (value === undefined || value === null) return ["src/lib/db.ts"];
  if (Array.isArray(value)) return value.filter((p) => typeof p === "string");
  return ["src/lib/db.ts"];
}

// Etapa de backup do deploy. Sem dbPath → null; arquivo ausente → null (o chamador
// emite o aviso). Cria o diretório de backup se necessário e copia o arquivo;
// retorna o destino escrito. Caminhos absolutos são honrados; diretórios relativos
// são resolvidos a partir da raiz do repositório. O nome é reservado atomicamente
// para que chamadas no mesmo instante nunca sobrescrevam um snapshot anterior.
export function performBackup(cfg, root) {
  if (!cfg.dbPath) return null;
  const src = path.resolve(root, cfg.dbPath);
  if (!existsSync(src)) return null;
  const dir = path.resolve(root, cfg.backupDir ?? path.join(path.dirname(cfg.dbPath), "backup"));
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const base = path.join(dir, `${path.basename(src)}-${ts}`);
  for (let attempt = 0; ; attempt++) {
    const dest = attempt === 0 ? base : `${base}-${attempt}`;
    let fd;
    try {
      fd = openSync(dest, "wx");
      closeSync(fd);
      fd = undefined;
      copyFileSync(src, dest);
      return dest;
    } catch (err) {
      if (fd !== undefined) {
        try { closeSync(fd); } catch {}
      }
      if (err?.code === "EEXIST") continue;
      try { unlinkSync(dest); } catch {}
      throw err;
    }
  }
}
