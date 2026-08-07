// Funções puras do motor ship.mjs — sem efeitos colaterais, testáveis isoladamente.
// ship.mjs importa daqui; os testes em ship/bin/lib.test.mjs cobrem os contratos.

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
// v(X.Y.Z) a partir do texto âncora "Versão da aplicação" (se presente)
// senão a primeira ocorrência. Retorna a versão ou null.
export function extractServedVersion(html) {
  let text = (html ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const anchor = text.indexOf("Versão da aplicação");
  if (anchor !== -1) text = text.slice(anchor);
  return (text.match(/v(\d+\.\d+\.\d+)/) || [])[1] ?? null;
}
