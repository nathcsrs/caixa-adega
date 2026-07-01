const STORAGE_KEY = "caixa-ta-no-grale-entradas-v1";
const DAY_META_KEY = "caixa-ta-no-grale-dias-v1";
const ENTRY_DRAFT_KEY = "caixa-ta-no-grale-rascunho-v1";
const THEME_KEY = "caixa-ta-no-grale-tema-v1";
const ACCOUNT_NAME_KEY = "caixa-ta-no-grale-conta-nome-v1";
const ACCOUNT_ID_KEY = "caixa-ta-no-grale-conta-id-v1";
const DELETED_ENTRY_IDS_KEY = "caixa-ta-no-grale-entradas-apagadas-v1";
const SUPABASE_URL = "https://hmjfcxwxmxtwgvxfxajb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_eHIis5pghFsbnPmLdhDCPg_49FUPUih";
const cloudClient = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) || null;

const paymentLabels = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  credito: "Crédito",
  debito: "Débito",
};

const dayEventTags = {
  normal: "Normal",
  jogo: "Dia de jogo",
  promocao: "Promoção",
  sexta: "Sexta-feira",
  feriado: "Feriado",
  outro: "Outro evento",
};

const shiftLabels = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

const state = {
  view: "cash",
  selectedDate: getTodayISO(),
  calendarMonth: getTodayISO().slice(0, 7),
  calendarOpen: false,
  historyDate: null,
  expandedEntryDates: new Set(),
  entries: loadEntries(),
  deletedEntryIds: loadDeletedEntryIds(),
  dayMeta: loadDayMeta(),
  entryDraft: loadEntryDraft(),
  theme: loadTheme(),
  cloud: {
    ready: false,
    user: null,
    username: loadAccountName(),
    syncing: false,
    status: cloudClient ? "Conta desconectada" : "Nuvem indisponivel",
    error: "",
  },
  accountModal: {
    open: false,
    mode: "login",
    error: "",
    loading: false,
  },
  modal: {
    open: false,
    editingId: null,
    error: "",
    autoShift: "",
  },
  closeConfirm: {
    open: false,
  },
  closingImage: {
    open: false,
    error: "",
  },
};

const visibleEntriesOnStart = state.entries.filter((entry) => !isEntryDeleted(entry.id));
if (visibleEntriesOnStart.length !== state.entries.length) {
  state.entries = visibleEntriesOnStart;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

const app = document.querySelector("#app");
applyTheme();

function getTodayISO() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    const normalized = normalizeEntries(parsed);
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
  syncEntriesToCloud();
}

function loadDeletedEntryIds() {
  try {
    const raw = localStorage.getItem(DELETED_ENTRY_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    if (Array.isArray(parsed)) {
      return Object.fromEntries(parsed.map((id) => [String(id), new Date().toISOString()]));
    }

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDeletedEntryIds() {
  localStorage.setItem(DELETED_ENTRY_IDS_KEY, JSON.stringify(state.deletedEntryIds));
}

function isEntryDeleted(id) {
  return Boolean(id && state.deletedEntryIds[id]);
}

function markEntryDeleted(id) {
  if (!id) return;
  state.deletedEntryIds[id] = new Date().toISOString();
  saveDeletedEntryIds();
}

function loadEntryDraft() {
  try {
    const raw = localStorage.getItem(ENTRY_DRAFT_KEY);
    const draft = raw ? JSON.parse(raw) : null;
    return draft && typeof draft === "object" ? draft : null;
  } catch {
    return null;
  }
}

function saveEntryDraft(draft) {
  state.entryDraft = draft;
  localStorage.setItem(ENTRY_DRAFT_KEY, JSON.stringify(draft));
}

function clearEntryDraft() {
  state.entryDraft = null;
  localStorage.removeItem(ENTRY_DRAFT_KEY);
}

function loadTheme() {
  const theme = localStorage.getItem(THEME_KEY);
  return theme === "light" ? "light" : "dark";
}

function loadAccountName() {
  return localStorage.getItem(ACCOUNT_NAME_KEY) || "";
}

function saveAccountName(username) {
  state.cloud.username = username;
  if (username) {
    localStorage.setItem(ACCOUNT_NAME_KEY, username);
  } else {
    localStorage.removeItem(ACCOUNT_NAME_KEY);
  }
}

function saveTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, state.theme);
  applyTheme();
}

function applyTheme() {
  if (document.documentElement) {
    document.documentElement.dataset.theme = state.theme;
  }
}

function toggleTheme() {
  saveTheme(state.theme === "dark" ? "light" : "dark");
  render();
}

function normalizeEntries(entries) {
  const normalized = entries.map((entry) => ({
    ...entry,
    payment: paymentLabels[entry.payment] ? entry.payment : "dinheiro",
    entryTime: entry.entryTime || formatTime(entry.createdAt),
    shift: shiftLabels[entry.shift]
      ? entry.shift
      : getShiftFromTime(entry.entryTime || formatTime(entry.createdAt)),
  }));
  const existingNumbers = normalized
    .map((entry) => Number(entry.saleNumber))
    .filter((number) => Number.isInteger(number) && number > 0);
  let nextNumber = existingNumbers.length ? Math.max(...existingNumbers) + 1 : 1;

  normalized
    .filter((entry) => !Number.isInteger(Number(entry.saleNumber)) || Number(entry.saleNumber) <= 0)
    .sort((a, b) =>
      String(a.createdAt || `${a.date} ${a.entryTime}`).localeCompare(
        String(b.createdAt || `${b.date} ${b.entryTime}`),
      ),
    )
    .forEach((entry) => {
      entry.saleNumber = nextNumber;
      nextNumber += 1;
    });

  return normalized;
}

function loadDayMeta() {
  try {
    const raw = localStorage.getItem(DAY_META_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const normalized = normalizeDayMeta(parsed);
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      localStorage.setItem(DAY_META_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveDayMeta() {
  localStorage.setItem(DAY_META_KEY, JSON.stringify(state.dayMeta));
  syncDayMetaToCloud();
}

function normalizeDayMeta(dayMeta) {
  return Object.fromEntries(
    Object.entries(dayMeta).map(([date, meta]) => {
      const legacyNote = String(meta?.note || "").trim();
      const eventTag = dayEventTags[meta?.eventTag]
        ? meta.eventTag
        : legacyNote
          ? "outro"
          : "normal";

      return [
        date,
        {
          ...meta,
          note: "",
          eventTag,
          customEvent: eventTag === "outro" ? String(meta?.customEvent || legacyNote).trim() : "",
        },
      ];
    }),
  );
}

function formatCurrency(cents) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((Number(cents) || 0) / 100);
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function formatShortDate(isoDate) {
  return formatDate(isoDate).slice(0, 5);
}

function formatTime(value) {
  if (!value) return "";
  if (/^\d{2}:\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getCurrentTime() {
  return formatTime(new Date().toISOString());
}

function getShiftFromTime(value = getCurrentTime()) {
  const time = formatTime(value) || getCurrentTime();
  const hour = Number(time.slice(0, 2));

  if (hour >= 6 && hour < 12) return "manha";
  if (hour >= 12 && hour < 18) return "tarde";
  return "noite";
}

function formatSaleNumber(number) {
  return String(Number(number) || 0).padStart(4, "0");
}

function toLocalDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseMoneyToCents(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$/gi, "");

  if (!raw) return 0;

  let normalized = raw.replace(/[^\d,.-]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const number = Number(normalized);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function getMaskedMoneyValue(value, inputType = "") {
  const raw = String(value || "");
  const pasted = inputType === "insertFromPaste" || inputType === "insertFromDrop";
  const cents = pasted && /[,.]/.test(raw)
    ? parseMoneyToCents(raw)
    : Number(raw.replace(/\D/g, "") || 0);

  return formatCurrency(cents);
}

function applyMoneyMask(input, inputType = "") {
  if (!input) return;
  input.value = getMaskedMoneyValue(input.value, inputType);
  try {
    input.setSelectionRange(input.value.length, input.value.length);
  } catch {
    // Alguns navegadores móveis não permitem controlar o cursor nesse campo.
  }
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeUsername(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 32);
}

function accountEmail(username) {
  return `${username}@caixa-ta-no-grale.app`;
}

function accountPassword(username, pin) {
  return `Grale-${username}-${pin}-caixa-2026!`;
}

function usernameFromUser(user) {
  const metadataName = normalizeUsername(user?.user_metadata?.username || "");
  const emailName = normalizeUsername(String(user?.email || "").split("@")[0] || "");
  return metadataName || loadAccountName() || emailName;
}

function setCloudStatus(status, error = "") {
  state.cloud.status = status;
  state.cloud.error = error;
}

function openAccountModal(mode = state.cloud.user ? "connected" : "login") {
  state.accountModal.open = true;
  state.accountModal.mode = mode === "signup" ? "signup" : mode === "connected" ? "connected" : "login";
  state.accountModal.error = "";
  render();
}

function closeAccountModal() {
  state.accountModal.open = false;
  state.accountModal.error = "";
  state.accountModal.loading = false;
  render();
}

function setAccountMode(mode) {
  const usernameInput = document.querySelector("#account-username");
  if (usernameInput?.value) saveAccountName(normalizeUsername(usernameInput.value));
  state.accountModal.mode = mode === "signup" ? "signup" : "login";
  state.accountModal.error = "";
  render();
}

function friendlyCloudError(error) {
  const message = String(error?.message || error || "");
  if (/invalid login credentials/i.test(message)) {
    return "Nome de usuario ou senha de 4 digitos nao conferem.";
  }
  if (/email not confirmed|confirm/i.test(message)) {
    return "O Supabase pediu confirmacao por e-mail. Desative a confirmacao por e-mail nas configuracoes de Auth.";
  }
  if (/relation .*cash_|does not exist|schema cache/i.test(message)) {
    return "As tabelas da nuvem ainda nao foram criadas. Rode o SQL do arquivo supabase-schema.sql no Supabase.";
  }
  return message || "Nao consegui conectar agora. Tente novamente.";
}

function localEntryToCloud(entry) {
  return {
    id: entry.id,
    user_id: state.cloud.user.id,
    date: entry.date,
    amount_cents: Number(entry.amountCents) || 0,
    payment: paymentLabels[entry.payment] ? entry.payment : "dinheiro",
    shift: shiftLabels[entry.shift] ? entry.shift : "noite",
    sale_number: Number(entry.saleNumber) || getNextSaleNumber(),
    description: entry.description || "",
    entry_time: formatTime(entry.entryTime || entry.createdAt),
    created_at: entry.createdAt || new Date().toISOString(),
    updated_at: entry.updatedAt || entry.createdAt || new Date().toISOString(),
  };
}

function cloudEntryToLocal(row) {
  return {
    id: row.id,
    date: row.date,
    amountCents: Number(row.amount_cents) || 0,
    payment: paymentLabels[row.payment] ? row.payment : "dinheiro",
    shift: shiftLabels[row.shift] ? row.shift : "noite",
    saleNumber: Number(row.sale_number) || 0,
    description: row.description || "",
    entryTime: row.entry_time || formatTime(row.created_at),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function cloudMetaToLocal(row) {
  return {
    closed: Boolean(row.closed),
    closedAt: row.closed_at || "",
    note: "",
    eventTag: dayEventTags[row.event_tag] ? row.event_tag : "normal",
    customEvent: row.custom_event || "",
    updatedAt: row.updated_at || "",
  };
}

function isComandaEntry(entryOrId) {
  if (!entryOrId) return false;
  const id = typeof entryOrId === "string" ? entryOrId : entryOrId.id;
  const description = typeof entryOrId === "string" ? "" : entryOrId.description || "";
  return String(id || "").startsWith("comanda-") || /^Comanda\s+/i.test(String(description));
}

function removeComandaEntriesMissingFromCloud(localEntries, cloudEntries) {
  const cloudIds = new Set(cloudEntries.map((entry) => entry.id));
  let removedAny = false;

  const visibleEntries = localEntries.filter((entry) => {
    if (!isComandaEntry(entry) || cloudIds.has(entry.id)) return true;

    markEntryDeleted(entry.id);
    removedAny = true;
    return false;
  });

  return {
    entries: visibleEntries,
    removedAny,
  };
}

function localDayMetaRows() {
  return Object.entries(state.dayMeta).map(([date, meta]) => ({
    user_id: state.cloud.user.id,
    date,
    closed: Boolean(meta.closed),
    closed_at: meta.closedAt || null,
    event_tag: dayEventTags[meta.eventTag] ? meta.eventTag : "normal",
    custom_event: meta.customEvent || "",
    note: "",
    updated_at: meta.updatedAt || new Date().toISOString(),
  }));
}

function isNewer(first, second) {
  const firstTime = new Date(first?.updatedAt || first?.createdAt || 0).getTime();
  const secondTime = new Date(second?.updatedAt || second?.createdAt || 0).getTime();
  return firstTime >= secondTime;
}

function mergeEntries(localEntries, cloudEntries) {
  const merged = new Map();
  localEntries
    .filter((entry) => !isEntryDeleted(entry.id))
    .forEach((entry) => merged.set(entry.id, entry));
  cloudEntries.forEach((entry) => {
    if (isEntryDeleted(entry.id)) return;
    const current = merged.get(entry.id);
    merged.set(entry.id, !current || isNewer(entry, current) ? entry : current);
  });
  return normalizeEntries(Array.from(merged.values())).sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
}

function mergeDayMeta(localMeta, cloudMeta) {
  const merged = { ...localMeta };
  Object.entries(cloudMeta).forEach(([date, meta]) => {
    const current = merged[date];
    const cloudTime = new Date(meta?.updatedAt || 0).getTime();
    const localTime = new Date(current?.updatedAt || 0).getTime();
    if (!current || cloudTime >= localTime) merged[date] = meta;
  });
  return normalizeDayMeta(merged);
}

async function syncEntriesToCloud() {
  if (!cloudClient || !state.cloud.user) return;
  state.cloud.syncing = true;
  setCloudStatus("Salvando na nuvem...");

  try {
    await syncDeletedEntriesToCloud();
    const rows = state.entries
      .filter((entry) => !isEntryDeleted(entry.id))
      .filter((entry) => !isComandaEntry(entry))
      .map(localEntryToCloud)
      .filter((row) => row.amount_cents > 0);
    if (rows.length) {
      const { error } = await cloudClient.from("cash_entries").upsert(rows, { onConflict: "user_id,id" });
      if (error) throw error;
    }
    setCloudStatus("Dados salvos na nuvem");
  } catch (error) {
    setCloudStatus("Erro na nuvem", friendlyCloudError(error));
  } finally {
    state.cloud.syncing = false;
    render();
  }
}

async function syncDeletedEntriesToCloud() {
  if (!cloudClient || !state.cloud.user) return;

  const ids = Object.keys(state.deletedEntryIds || {});
  if (!ids.length) return;

  const { error } = await cloudClient
    .from("cash_entries")
    .delete()
    .eq("user_id", state.cloud.user.id)
    .in("id", ids);

  if (error) throw error;
}

async function syncDayMetaToCloud() {
  if (!cloudClient || !state.cloud.user) return;
  state.cloud.syncing = true;
  setCloudStatus("Salvando na nuvem...");

  try {
    const rows = localDayMetaRows();
    if (rows.length) {
      const { error } = await cloudClient.from("cash_day_meta").upsert(rows, { onConflict: "user_id,date" });
      if (error) throw error;
    }
    setCloudStatus("Dados salvos na nuvem");
  } catch (error) {
    setCloudStatus("Erro na nuvem", friendlyCloudError(error));
  } finally {
    state.cloud.syncing = false;
    render();
  }
}

async function deleteCloudEntry(id) {
  if (!cloudClient || !state.cloud.user || !id) return;

  try {
    const { error } = await cloudClient
      .from("cash_entries")
      .delete()
      .eq("user_id", state.cloud.user.id)
      .eq("id", id);
    if (error) throw error;
    setCloudStatus("Dados salvos na nuvem");
  } catch (error) {
    setCloudStatus("Erro na nuvem", friendlyCloudError(error));
    render();
  }
}

async function loadCloudData() {
  if (!cloudClient || !state.cloud.user) return;
  state.cloud.syncing = true;
  setCloudStatus("Atualizando dados...");
  render();

  try {
    await syncDeletedEntriesToCloud();

    const [entriesResult, metaResult] = await Promise.all([
      cloudClient.from("cash_entries").select("*").order("created_at", { ascending: false }),
      cloudClient.from("cash_day_meta").select("*"),
    ]);

    if (entriesResult.error) throw entriesResult.error;
    if (metaResult.error) throw metaResult.error;

    const previousAccountId = localStorage.getItem(ACCOUNT_ID_KEY);
    const sameOrFirstAccount = !previousAccountId || previousAccountId === state.cloud.user.id;
    const shouldPruneMissingComandas = previousAccountId === state.cloud.user.id;
    const cloudEntries = (entriesResult.data || []).map(cloudEntryToLocal).filter((entry) => !isEntryDeleted(entry.id));
    const cloudMeta = Object.fromEntries(
      (metaResult.data || []).map((row) => [row.date, cloudMetaToLocal(row)]),
    );
    const localEntries = shouldPruneMissingComandas
      ? removeComandaEntriesMissingFromCloud(state.entries, cloudEntries).entries
      : state.entries;

    state.entries = sameOrFirstAccount
      ? mergeEntries(localEntries, cloudEntries)
      : normalizeEntries(cloudEntries.filter((entry) => !isEntryDeleted(entry.id)));
    state.dayMeta = sameOrFirstAccount ? mergeDayMeta(state.dayMeta, cloudMeta) : normalizeDayMeta(cloudMeta);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
    localStorage.setItem(DAY_META_KEY, JSON.stringify(state.dayMeta));
    localStorage.setItem(ACCOUNT_ID_KEY, state.cloud.user.id);

    setCloudStatus("Dados salvos na nuvem");
    state.cloud.ready = true;
    render();
    await syncEntriesToCloud();
    await syncDayMetaToCloud();
  } catch (error) {
    setCloudStatus("Erro na nuvem", friendlyCloudError(error));
    render();
  } finally {
    state.cloud.syncing = false;
  }
}

async function applyCloudUser(user, shouldLoad = true) {
  state.cloud.user = user || null;
  state.cloud.ready = true;
  const username = user ? usernameFromUser(user) : loadAccountName();
  saveAccountName(username || "");
  setCloudStatus(user ? "Conta conectada" : "Conta desconectada");
  if (user && shouldLoad) await loadCloudData();
  render();
}

async function initializeCloud() {
  if (!cloudClient) {
    state.cloud.ready = true;
    setCloudStatus("Nuvem indisponivel", "Nao consegui carregar a conexao com o Supabase.");
    render();
    return;
  }

  try {
    const { data, error } = await cloudClient.auth.getSession();
    if (error) throw error;
    await applyCloudUser(data.session?.user || null);
    cloudClient.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      if (nextUser?.id !== state.cloud.user?.id) {
        applyCloudUser(nextUser);
      }
    });
  } catch (error) {
    state.cloud.ready = true;
    setCloudStatus("Erro na nuvem", friendlyCloudError(error));
    render();
  }
}

async function submitAccountForm(formData) {
  if (!cloudClient) return "A conexao com a nuvem nao carregou. Veja se ha internet.";

  const username = normalizeUsername(formData.get("username"));
  const pin = String(formData.get("pin") || "").replace(/\D/g, "");

  if (username.length < 3) return "Use um nome de usuario com pelo menos 3 caracteres.";
  if (!/^\d{4}$/.test(pin)) return "A senha precisa ter exatamente 4 numeros.";

  const email = accountEmail(username);
  const password = accountPassword(username, pin);
  state.accountModal.loading = true;
  state.accountModal.error = "";
  render();

  try {
    const result =
      state.accountModal.mode === "signup"
        ? await cloudClient.auth.signUp({
            email,
            password,
            options: { data: { username } },
          })
        : await cloudClient.auth.signInWithPassword({ email, password });

    if (result.error) throw result.error;
    saveAccountName(username);

    if (state.accountModal.mode === "signup" && !result.data.session) {
      return "Conta criada, mas o Supabase pediu confirmacao por e-mail. Desative a confirmacao por e-mail no Supabase e tente entrar.";
    }

    state.accountModal.open = false;
    await applyCloudUser(result.data.user || result.data.session?.user || null);
    return "";
  } catch (error) {
    return friendlyCloudError(error);
  } finally {
    state.accountModal.loading = false;
    render();
  }
}

async function signOutAccount() {
  if (cloudClient) await cloudClient.auth.signOut();
  state.cloud.user = null;
  setCloudStatus("Conta desconectada");
  state.accountModal.open = false;
  render();
}

function icon(name) {
  const icons = {
    plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    edit: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m13.5 6 4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M9 7l1-3h4l1 3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    list: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    cash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v10H4V7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 10c2 0 3-1 3-3M20 14c-2 0-3 1-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    download: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10M8 10l4 4 4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0-2.83-4M6 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8.7 15.4l6.6-3.8M8.7 8.6l6.6 3.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    image: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5V5Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="m7 17 4.2-4.2 2.3 2.3 1.6-1.6L19 17M8.5 9.5h.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    theme: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 8 8 5.5 5.5 0 0 1-8-8Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sun: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    lock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    unlock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8a5 5 0 0 1 9.2-2.7M6 11h12v9H6v-9Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    logout: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-1M14 12H3M7 8l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    user: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    eye: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
    close: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    calendar: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4M17 3v4M4 9h16M5 5h14v15H5V5Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrow: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pix: '<img class="icon pix-icon" src="./public/pix-icon.png" alt="" aria-hidden="true" />',
    card: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v10H4V7Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M4 10h16M7 15h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    clock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    party: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 5-14 9 9-14 5Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 4h.01M18 7h.01M20 12h.01M11 5c1 3 3 5 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    register: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10h10l1 10H6l1-10ZM9 10V6h6v4M8 14h.01M12 14h.01M16 14h.01M8 17h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    receipt: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21V3Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 8h6M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  };
  return icons[name] || "";
}

function entriesForDate(date) {
  return state.entries
    .filter((entry) => entry.date === date)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function getDayMeta(date) {
  return {
    closed: false,
    note: "",
    eventTag: "normal",
    customEvent: "",
    ...(state.dayMeta[date] || {}),
  };
}

function isDayClosed(date) {
  return Boolean(getDayMeta(date).closed);
}

function updateDayMeta(date, changes) {
  const current = getDayMeta(date);
  state.dayMeta[date] = {
    ...current,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  saveDayMeta();
}

function getDayEventLabel(metaOrDate) {
  const meta = typeof metaOrDate === "string" ? getDayMeta(metaOrDate) : metaOrDate;
  if (meta.eventTag === "outro") {
    return String(meta.customEvent || "").trim() || "Outro evento";
  }
  return dayEventTags[meta.eventTag] || dayEventTags.normal;
}

function hasDayEvent(metaOrDate) {
  const meta = typeof metaOrDate === "string" ? getDayMeta(metaOrDate) : metaOrDate;
  if (meta.eventTag === "outro") return Boolean(String(meta.customEvent || "").trim());
  return Boolean(meta.eventTag && meta.eventTag !== "normal");
}

function getTotals(entries) {
  return entries.reduce(
    (totals, entry) => {
      totals.general += entry.amountCents;
      if (entry.payment === "dinheiro") totals.cash += entry.amountCents;
      if (entry.payment === "pix") totals.pix += entry.amountCents;
      if (entry.payment === "credito") totals.credit += entry.amountCents;
      if (entry.payment === "debito") totals.debit += entry.amountCents;
      if (entry.payment === "credito" || entry.payment === "debito") {
        totals.card += entry.amountCents;
      }
      return totals;
    },
    { cash: 0, pix: 0, credit: 0, debit: 0, card: 0, general: 0 },
  );
}

function getShiftTotals(entries) {
  return entries.reduce(
    (totals, entry) => {
      const shift = shiftLabels[entry.shift] ? entry.shift : "noite";
      totals[shift] += entry.amountCents;
      return totals;
    },
    { manha: 0, tarde: 0, noite: 0 },
  );
}

function entriesBetween(startDate, endDate) {
  return state.entries.filter((entry) => entry.date >= startDate && entry.date <= endDate);
}

function getWeekRange(isoDate) {
  const date = toLocalDate(isoDate);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: toISODate(start),
    end: toISODate(end),
  };
}

function getMonthRange(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    start: toISODate(start),
    end: toISODate(end),
  };
}

function addMonths(monthKey, amount) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return toISODate(date).slice(0, 7);
}

function datesWithEntries() {
  return new Set(state.entries.map((entry) => entry.date));
}

function totalsByDate() {
  return state.entries.reduce((totals, entry) => {
    totals[entry.date] = (totals[entry.date] || 0) + entry.amountCents;
    return totals;
  }, {});
}

function movementClass(total, maxTotal) {
  if (!total || !maxTotal) return "";
  const ratio = total / maxTotal;
  if (ratio >= 0.85) return "movement-top";
  if (ratio >= 0.55) return "movement-high";
  if (ratio >= 0.25) return "movement-mid";
  return "movement-low";
}

function hasExportData() {
  return (
    state.entries.length > 0 ||
    Object.values(state.dayMeta).some((meta) => meta?.closed || hasDayEvent(meta))
  );
}

function getHistoryDays() {
  const grouped = new Map();

  state.entries.forEach((entry) => {
    const current = grouped.get(entry.date) || {
      date: entry.date,
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total += entry.amountCents;
    grouped.set(entry.date, current);
  });

  return Array.from(grouped.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function setView(view) {
  state.view = view;
  state.historyDate = view === "history" ? state.historyDate : null;
  render();
}

function openAddModal(date = state.selectedDate) {
  if (isDayClosed(date)) {
    window.alert("Este dia está fechado. Reabra o caixa para adicionar entradas.");
    return;
  }

  state.modal.open = true;
  state.modal.editingId = null;
  state.modal.error = "";
  state.modal.autoShift = getShiftFromTime();
  render();
  const form = document.querySelector("#entry-form");
  if (form) {
    if (!state.entryDraft) form.elements.date.value = date;
    form.elements.amount.focus();
  }
}

function openEditModal(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (entry && isDayClosed(entry.date)) {
    window.alert("Este dia está fechado. Reabra o caixa para editar entradas.");
    return;
  }

  state.modal.open = true;
  state.modal.editingId = id;
  state.modal.error = "";
  state.modal.autoShift = "";
  render();
  const form = document.querySelector("#entry-form");
  if (form) form.elements.amount.focus();
}

function closeModal() {
  state.modal.open = false;
  state.modal.editingId = null;
  state.modal.error = "";
  state.modal.autoShift = "";
  render();
}

function toggleSelectedDayClosed() {
  const date = state.selectedDate;
  const closed = isDayClosed(date);

  if (!closed) {
    state.closeConfirm.open = true;
    render();
    return;
  }

  if (!window.confirm("Reabrir este dia para permitir edições?")) return;

  updateDayMeta(date, {
    closed: false,
    closedAt: "",
  });

  render();
}

function closeCloseConfirm() {
  state.closeConfirm.open = false;
  render();
}

function confirmSelectedDayClosed() {
  updateDayMeta(state.selectedDate, {
    closed: true,
    closedAt: new Date().toISOString(),
  });

  state.closeConfirm.open = false;
  state.closingImage.open = true;
  render();
}

function saveSelectedDayEvent(formData) {
  if (isDayClosed(state.selectedDate)) {
    window.alert("Este dia está fechado. Reabra o caixa para alterar o evento.");
    return;
  }

  const eventTag = String(formData.get("eventTag") || "normal");
  const customEvent = String(formData.get("customEvent") || "").trim();

  if (!dayEventTags[eventTag]) {
    window.alert("Escolha uma tag de evento válida.");
    return;
  }
  if (eventTag === "outro" && !customEvent) {
    window.alert("Escreva o nome do evento ou escolha outra tag.");
    return;
  }

  updateDayMeta(state.selectedDate, {
    eventTag,
    customEvent: eventTag === "outro" ? customEvent : "",
    note: "",
  });
  render();
}

function upsertEntry(formData) {
  const id = state.modal.editingId;
  const existingEntry = state.entries.find((entry) => entry.id === id);
  const date = String(formData.get("date") || "");
  const amountCents = parseMoneyToCents(formData.get("amount"));
  const payment = String(formData.get("payment") || "");
  const shift = String(formData.get("shift") || existingEntry?.shift || state.modal.autoShift || getShiftFromTime());
  const description = String(formData.get("description") || "").trim();

  if (!date) return "Escolha a data da entrada.";
  if (!amountCents || amountCents <= 0) return "Informe um valor maior que zero.";
  if (!paymentLabels[payment]) return "Escolha a forma de pagamento.";
  if (!shiftLabels[shift]) return "Escolha um turno válido.";
  if (existingEntry && isDayClosed(existingEntry.date)) {
    return "Este dia está fechado. Reabra o caixa para editar.";
  }
  if (isDayClosed(date)) {
    return "Este dia está fechado. Reabra o caixa para lançar nessa data.";
  }

  const now = new Date().toISOString();

  if (id) {
    state.entries = state.entries.map((entry) =>
      entry.id === id
        ? {
          ...entry,
            date,
            amountCents,
            payment,
            shift,
            saleNumber: entry.saleNumber || getNextSaleNumber(),
            description,
            entryTime: entry.entryTime || formatTime(entry.createdAt),
            updatedAt: now,
          }
        : entry,
    );
  } else {
    state.entries = [
      {
        id: uid(),
        date,
        amountCents,
        payment,
        shift,
        saleNumber: getNextSaleNumber(),
        description,
        entryTime: getCurrentTime(),
        createdAt: now,
        updatedAt: now,
      },
      ...state.entries,
    ];
  }

  saveEntries();
  if (!id) clearEntryDraft();
  state.selectedDate = date;
  if (state.view === "history") state.historyDate = date;
  state.modal.open = false;
  state.modal.editingId = null;
  state.modal.error = "";
  state.modal.autoShift = "";
  return "";
}

function deleteEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  if (isDayClosed(entry.date)) {
    window.alert("Este dia está fechado. Reabra o caixa para excluir entradas.");
    return;
  }

  const ok = window.confirm("Excluir esta entrada? Essa ação não pode ser desfeita.");
  if (!ok) return;

  markEntryDeleted(id);
  state.entries = state.entries.filter((item) => item.id !== id);
  saveEntries();
  deleteCloudEntry(id);

  if (state.historyDate && !entriesForDate(state.historyDate).length) {
    state.historyDate = null;
  }

  render();
}

function paymentClass(payment) {
  if (payment === "dinheiro") return "cash";
  if (payment === "pix") return "pix";
  if (payment === "credito") return "credit";
  if (payment === "debito") return "debit";
  return "other";
}

function shiftClass(shift) {
  if (shift === "manha") return "morning";
  if (shift === "tarde") return "afternoon";
  return "night";
}

function getNextSaleNumber() {
  const numbers = state.entries
    .map((entry) => Number(entry.saleNumber))
    .filter((number) => Number.isInteger(number) && number > 0);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function renderEntryDescription(description) {
  const text = String(description || "").trim();
  if (!text) return "";

  const comandaMatch = text.match(/^(Comanda\s+.+?)\s*\((.+)\)\s*$/i);
  if (comandaMatch) {
    return `
      <div class="entry-description entry-comanda-description">
        <span class="entry-comanda-head">${escapeHtml(comandaMatch[1].trim())}</span>
        <span class="entry-comanda-items">${escapeHtml(comandaMatch[2].trim())}</span>
      </div>
    `;
  }

  return `<p class="entry-description">${escapeHtml(text)}</p>`;
}

function renderEntryList(entries, showDate = false) {
  if (!entries.length) {
    return `
      <div class="empty-state empty-state-brand">
        <div class="empty-content">
          <img class="empty-bear" src="./public/urso-vazio.png" alt="" aria-hidden="true" />
          <div class="empty-copy">
            <div class="empty-title-line">
              <strong>Nenhuma entrada registrada.</strong>
            </div>
          <span>Toque em Adicionar entrada para começar o caixa deste dia!</span>
          </div>
        </div>
      </div>
    `;
  }

  const listDate = entries[0]?.date || state.selectedDate;
  const expanded = state.expandedEntryDates.has(listDate);
  const visibleEntries = expanded ? entries : entries.slice(0, 5);
  const hasMoreEntries = entries.length > visibleEntries.length;

  return `
    <div class="entry-list">
      ${visibleEntries
        .map((entry) => {
          const locked = isDayClosed(entry.date);
          return `
            <article class="entry-item">
              <div class="entry-main">
                <div class="entry-kicker">
                  <span class="sale-pill">Venda #${formatSaleNumber(entry.saleNumber)}</span>
                  <span class="payment-pill ${paymentClass(entry.payment)}">${paymentLabels[entry.payment] || paymentLabels.dinheiro}</span>
                  <span class="shift-pill ${shiftClass(entry.shift)}">${shiftLabels[entry.shift] || shiftLabels.noite}</span>
                  ${locked ? '<span class="status-pill">Fechado</span>' : ""}
                </div>
                ${renderEntryDescription(entry.description)}
                <p class="entry-date-note">
                  ${showDate ? `${formatDate(entry.date)} • ` : ""}Lançada às ${formatTime(entry.entryTime || entry.createdAt)}
                </p>
              </div>
              <p class="entry-value">${formatCurrency(entry.amountCents)}</p>
              <div class="entry-actions" aria-label="Ações da entrada">
                <button class="icon-btn" type="button" data-action="edit-entry" data-id="${entry.id}" title="Editar entrada" aria-label="Editar entrada" ${locked ? "disabled" : ""}>
                  ${icon("edit")}
                </button>
                <button class="icon-btn danger" type="button" data-action="delete-entry" data-id="${entry.id}" title="Excluir entrada" aria-label="Excluir entrada" ${locked ? "disabled" : ""}>
                  ${icon("trash")}
                </button>
              </div>
            </article>
          `;
        })
        .join("")}
      ${
        hasMoreEntries
          ? `
            <button class="entry-more-button" type="button" data-action="show-more-entries" data-date="${listDate}">
              Ver mais
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderSummary(entries, dayMeta, closed) {
  const totals = getTotals(entries);
  const shiftTotals = getShiftTotals(entries);
  const paymentCards = [
    ["Dinheiro", totals.cash, "payment-cash", icon("cash")],
    ["Pix", totals.pix, "payment-pix", icon("pix")],
    ["Cartão", totals.card, "payment-card", icon("card")],
  ];
  const shiftCards = [
    ["Manhã", shiftTotals.manha, "shift-morning", icon("sun")],
    ["Tarde", shiftTotals.tarde, "shift-afternoon", icon("sun")],
    ["Noite", shiftTotals.noite, "shift-night", icon("theme")],
  ];

  return `
    <section class="summary-panel">
      <div class="section-title-row">
        <h2>${icon("card")} Resumo por pagamento</h2>
        <button type="button" class="section-link" data-action="open-reports">Ver todos ${icon("arrow")}</button>
      </div>
      <div class="metric-grid payment-metrics">
        ${paymentCards
          .map(
            ([label, value, className, cardIcon]) => `
              <article class="metric-card ${className}">
                <span class="metric-icon">${cardIcon}</span>
                <span>${label}</span>
                <strong>${formatCurrency(value)}</strong>
              </article>
            `,
          )
          .join("")}
      </div>

      <div class="section-title-row">
        <h2>${icon("clock")} Resumo por turno</h2>
        <button type="button" class="section-link" data-action="open-reports">Ver todos ${icon("arrow")}</button>
      </div>
      <div class="metric-grid shift-metrics" aria-label="Resumo por turno">
        ${shiftCards
          .map(
            ([label, value, className, cardIcon]) => `
              <article class="metric-card ${className}">
                <span class="metric-icon">${cardIcon}</span>
                <span>${label}</span>
                <strong>${formatCurrency(value)}</strong>
              </article>
            `,
          )
          .join("")}
      </div>
      ${renderDayTools(dayMeta, closed)}
      ${renderEntryList(entries)}
    </section>
  `;
}

function renderPeriodSummary() {
  const weekRange = getWeekRange(state.selectedDate);
  const monthRange = getMonthRange(state.selectedDate.slice(0, 7));
  const weekEntries = entriesBetween(weekRange.start, weekRange.end);
  const monthEntries = entriesBetween(monthRange.start, monthRange.end);
  const weekTotals = getTotals(weekEntries);
  const monthTotals = getTotals(monthEntries);

  return `
    <section class="period-summary" aria-label="Resumo semanal e mensal">
      <article class="period-card">
        <span>Semana</span>
        <strong>${formatCurrency(weekTotals.general)}</strong>
        <small>${formatDate(weekRange.start)} a ${formatDate(weekRange.end)}</small>
      </article>
      <article class="period-card">
        <span>Mês</span>
        <strong>${formatCurrency(monthTotals.general)}</strong>
        <small>${monthLabel(state.selectedDate.slice(0, 7))}</small>
      </article>
    </section>
  `;
}

function renderCalendar() {
  const entryDates = datesWithEntries();
  const dayTotals = totalsByDate();
  const [year, month] = state.calendarMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const monthTotals = Object.entries(dayTotals)
    .filter(([date]) => date.startsWith(state.calendarMonth))
    .map(([, total]) => total);
  const maxMonthTotal = monthTotals.length ? Math.max(...monthTotals) : 0;
  const cells = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    cells.push('<span class="calendar-empty" aria-hidden="true"></span>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${state.calendarMonth}-${String(day).padStart(2, "0")}`;
    const meta = getDayMeta(date);
    const total = dayTotals[date] || 0;
    const classes = [
      "calendar-day",
      date === state.selectedDate ? "is-selected" : "",
      entryDates.has(date) ? "has-entry" : "",
      movementClass(total, maxMonthTotal),
      meta.closed ? "is-closed" : "",
      hasDayEvent(meta) ? "has-event" : "",
    ]
      .filter(Boolean)
      .join(" ");

    cells.push(`
      <button class="${classes}" type="button" data-action="select-calendar-date" data-date="${date}" title="${total ? formatCurrency(total) : "Sem entradas"}" aria-label="Selecionar ${formatDate(date)}${total ? `, total ${formatCurrency(total)}` : ""}">
        <span>${day}</span>
      </button>
    `);
  }

  return `
    <section class="calendar-panel" aria-label="Calendário com dias preenchidos">
      <div class="calendar-head">
        <div class="calendar-title">
          <span>Calendário</span>
          <strong>${monthLabel(state.calendarMonth)}</strong>
        </div>
        <div class="calendar-nav">
          <button class="icon-btn" type="button" data-action="prev-calendar-month" title="Mês anterior" aria-label="Mês anterior">
            ${icon("back")}
          </button>
          <button class="icon-btn next" type="button" data-action="next-calendar-month" title="Próximo mês" aria-label="Próximo mês">
            ${icon("back")}
          </button>
        </div>
      </div>
      <div class="calendar-weekdays" aria-hidden="true">
        <span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span>
      </div>
      <div class="calendar-grid">
        ${cells.join("")}
      </div>
      <div class="calendar-legend">
        <span><i class="legend-dot filled"></i> Movimento</span>
        <span><i class="legend-dot best"></i> Melhor dia</span>
        <span><i class="legend-dot closed"></i> Fechado</span>
        <span><i class="legend-dot event"></i> Evento</span>
      </div>
    </section>
  `;
}

function renderCalendarToggle() {
  return `
    <section class="date-selector">
      <button class="date-select-button" type="button" data-action="toggle-calendar" aria-expanded="${state.calendarOpen}">
        ${icon("calendar")}
        <strong>${formatDate(state.selectedDate)}</strong>
        ${icon("arrow")}
      </button>
      ${state.calendarOpen ? renderCalendar() : ""}
    </section>
  `;
}

function renderDayTools(dayMeta, closed) {
  const eventTag = dayEventTags[dayMeta.eventTag] ? dayMeta.eventTag : "normal";
  const isCustom = eventTag === "outro";
  const eventLabel = getDayEventLabel(dayMeta);

  return `
    <details class="day-event-card">
      <summary class="day-event-summary">
        ${icon("party")}
        <div>
          <span>Evento do dia</span>
          <strong>${escapeHtml(eventLabel)}</strong>
        </div>
        ${icon("arrow")}
      </summary>
      <form id="day-event-form" class="day-event-form">
        <div class="field-stack">
          <label for="day-event-tag">Escolha o evento</label>
          <select id="day-event-tag" name="eventTag" ${closed ? "disabled" : ""}>
            ${Object.entries(dayEventTags)
              .map(
                ([value, label]) => `
                  <option value="${value}" ${eventTag === value ? "selected" : ""}>${label}</option>
                `,
              )
              .join("")}
          </select>
        </div>
        <div class="field-stack event-custom-field ${isCustom ? "" : "is-hidden"}">
          <label for="day-event-custom">Qual evento?</label>
          <input id="day-event-custom" name="customEvent" type="text" value="${escapeHtml(dayMeta.customEvent || "")}" placeholder="Digite o nome do evento" ${closed ? "disabled" : ""} />
        </div>
        <button class="btn btn-quiet" type="submit" ${closed ? "disabled" : ""}>
          Salvar evento
        </button>
      </form>
    </details>
  `;
}

function buildDaySummaryMessage(date = state.selectedDate) {
  const totals = getTotals(entriesForDate(date));
  return `Caixa ${formatShortDate(date)}: Pix ${formatCurrency(totals.pix)}, Dinheiro ${formatCurrency(totals.cash)}, Cartão ${formatCurrency(totals.card)}. Total: ${formatCurrency(totals.general)}.`;
}

function shareDaySummary() {
  const message = buildDaySummaryMessage(state.selectedDate);
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener");
}

function openClosingImage() {
  state.closingImage.open = true;
  state.closingImage.error = "";
  render();
}

function closeClosingImage() {
  state.closingImage.open = false;
  state.closingImage.error = "";
  render();
}

function saveDraftFromForm(form) {
  if (!form || state.modal.editingId) return;

  saveEntryDraft({
    date: form.elements.date?.value || state.selectedDate,
    amount: form.elements.amount?.value || "",
    payment: form.elements.payment?.value || "dinheiro",
    shift: form.elements.shift?.value || getShiftFromTime(),
    description: form.elements.description?.value || "",
    updatedAt: new Date().toISOString(),
  });
}

function discardEntryDraft() {
  clearEntryDraft();
  render();
  const form = document.querySelector("#entry-form");
  if (form) form.elements.amount.focus();
}

function getClosingStats(date = state.selectedDate) {
  const entries = entriesForDate(date);
  const totals = getTotals(entries);

  return {
    entries,
    totals,
    shiftTotals: getShiftTotals(entries),
    meta: getDayMeta(date),
  };
}

function scheduleClosingCanvasDraw() {
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(() => drawClosingCanvas());
    return;
  }

  drawClosingCanvas();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawText(ctx, text, x, y, options = {}) {
  ctx.fillStyle = options.color || "#15131d";
  ctx.font = `${options.weight || 700} ${options.size || 32}px ${options.family || "Inter, Arial, sans-serif"}`;
  ctx.textAlign = options.align || "left";
  ctx.textBaseline = options.baseline || "alphabetic";
  ctx.fillText(text, x, y);
}

function drawClosingPaymentIcon(ctx, type, x, y) {
  ctx.save();
  ctx.strokeStyle = "#05050a";
  ctx.fillStyle = "#05050a";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (type === "cash") {
    roundRect(ctx, x - 28, y - 18, 56, 36, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 28, y - 8);
    ctx.quadraticCurveTo(x - 14, y - 8, x - 14, y - 18);
    ctx.moveTo(x + 28, y + 8);
    ctx.quadraticCurveTo(x + 14, y + 8, x + 14, y + 18);
    ctx.stroke();
  }

  if (type === "pix") {
    const drawDiamond = (dx, dy, size) => {
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy - size);
      ctx.lineTo(x + dx + size, y + dy);
      ctx.lineTo(x + dx, y + dy + size);
      ctx.lineTo(x + dx - size, y + dy);
      ctx.closePath();
      ctx.fill();
    };
    drawDiamond(0, -18, 16);
    drawDiamond(0, 18, 16);
    drawDiamond(-24, 0, 16);
    drawDiamond(24, 0, 16);
  }

  if (type === "credit" || type === "debit") {
    roundRect(ctx, x - 32, y - 21, 64, 42, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 31, y - 7);
    ctx.lineTo(x + 31, y - 7);
    ctx.stroke();
    if (type === "credit") {
      ctx.beginPath();
      ctx.moveTo(x - 18, y + 9);
      ctx.lineTo(x + 7, y + 9);
      ctx.stroke();
    } else {
      ctx.lineWidth = 5;
      roundRect(ctx, x - 22, y + 2, 18, 13, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 10);
      ctx.lineTo(x + 20, y + 10);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function drawClosingCanvas() {
  const canvas = document.querySelector("#closing-canvas");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const width = 1080;
  const height = 1920;
  const stats = getClosingStats();
  const status = stats.meta.closed ? "CAIXA FECHADO" : "CAIXA ABERTO";
  const generatedAt = formatTime(new Date().toISOString());

  canvas.width = width;
  canvas.height = height;

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#030508");
  background.addColorStop(0.36, "#0b0718");
  background.addColorStop(0.72, "#070b14");
  background.addColorStop(1, "#020308");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const topLine = ctx.createLinearGradient(0, 0, width, 0);
  topLine.addColorStop(0, "#ffd447");
  topLine.addColorStop(0.48, "#7d3cff");
  topLine.addColorStop(1, "#19c8ff");
  ctx.fillStyle = topLine;
  ctx.fillRect(0, 0, width, 18);
  ctx.fillStyle = "#19c8ff";
  ctx.fillRect(0, height - 16, width, 16);

  ctx.fillStyle = "rgba(125, 60, 255, 0.24)";
  ctx.beginPath();
  ctx.ellipse(930, 210, 360, 240, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(98, 217, 255, 0.12)";
  ctx.beginPath();
  ctx.ellipse(120, 265, 430, 210, -0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.beginPath();
  ctx.arc(840, 285, 74, 0, Math.PI * 2);
  ctx.arc(762, 346, 36, 0, Math.PI * 2);
  ctx.arc(820, 382, 42, 0, Math.PI * 2);
  ctx.arc(892, 370, 38, 0, Math.PI * 2);
  ctx.arc(930, 318, 34, 0, Math.PI * 2);
  ctx.fill();

  const drawMountains = (baseY, alpha = 0.85) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#101735";
    ctx.beginPath();
    ctx.moveTo(580, baseY);
    ctx.lineTo(710, baseY - 180);
    ctx.lineTo(805, baseY - 50);
    ctx.lineTo(905, baseY - 250);
    ctx.lineTo(1070, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a2d53";
    ctx.beginPath();
    ctx.moveTo(690, baseY);
    ctx.lineTo(805, baseY - 150);
    ctx.lineTo(895, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(98,217,255,0.55)";
    ctx.beginPath();
    ctx.moveTo(710, baseY - 180);
    ctx.lineTo(748, baseY - 116);
    ctx.lineTo(684, baseY - 122);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(905, baseY - 250);
    ctx.lineTo(952, baseY - 164);
    ctx.lineTo(866, baseY - 171);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  drawMountains(330, 0.7);

  const [logo, safeImage] = await Promise.all([
    loadImage("./public/logo-adega.png"),
    loadImage("./public/cofre-total.png"),
  ]);
  if (logo) {
    const logoWidth = 185;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    ctx.drawImage(logo, 64, 70, logoWidth, logoHeight);
  }

  drawText(ctx, "FECHAMENTO DE CAIXA", 292, 122, {
    color: "#ffd447",
    size: 32,
    weight: 900,
  });
  drawText(ctx, "Adega Tá No Grale", 292, 182, {
    color: "#ffffff",
    size: 58,
    weight: 900,
  });
  drawText(ctx, formatDate(state.selectedDate), 292, 238, {
    color: "#62d9ff",
    size: 32,
    weight: 800,
  });

  ctx.fillStyle = "#ffd447";
  roundRect(ctx, 706, 205, 296, 56, 28);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#05050a";
  ctx.stroke();
  drawText(ctx, `✓ ${status}`, 854, 242, {
    color: "#05050a",
    size: 23,
    weight: 900,
    align: "center",
  });

  ctx.fillStyle = "#05050a";
  roundRect(ctx, 52, 350, 976, 390, 44);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#b984ff";
  roundRect(ctx, 58, 356, 964, 378, 40);
  ctx.stroke();
  const totalCard = ctx.createLinearGradient(72, 370, 1008, 720);
  totalCard.addColorStop(0, "#f7fdff");
  totalCard.addColorStop(0.55, "#eaf8ff");
  totalCard.addColorStop(1, "#c9efff");
  ctx.fillStyle = totalCard;
  roundRect(ctx, 70, 368, 940, 354, 34);
  ctx.fill();
  ctx.fillStyle = "rgba(98, 217, 255, 0.18)";
  ctx.beginPath();
  ctx.moveTo(410, 722);
  ctx.lineTo(598, 520);
  ctx.lineTo(720, 722);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(98, 217, 255, 0.28)";
  ctx.beginPath();
  ctx.moveTo(560, 722);
  ctx.lineTo(760, 472);
  ctx.lineTo(965, 722);
  ctx.closePath();
  ctx.fill();

  if (safeImage) {
    const safeWidth = 410;
    const safeHeight = (safeImage.height / safeImage.width) * safeWidth;
    ctx.drawImage(safeImage, 646, 447, safeWidth, safeHeight);
  }

  drawText(ctx, "TOTAL DO DIA", 118, 452, {
    color: "#4f22b8",
    size: 28,
    weight: 900,
  });
  const totalText = formatCurrency(stats.totals.general);
  const totalSize = totalText.length > 13 ? 82 : totalText.length > 10 ? 94 : 106;
  ctx.shadowColor = "rgba(98, 217, 255, 0.55)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 7;
  ctx.shadowOffsetY = 7;
  drawText(ctx, totalText, 118, 580, {
    color: "#05050a",
    size: totalSize,
    weight: 900,
  });
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "#5a5a78";
  ctx.lineWidth = 4;
  roundRect(ctx, 118, 636, 20, 30, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(124, 646);
  ctx.lineTo(134, 646);
  ctx.moveTo(124, 655);
  ctx.lineTo(134, 655);
  ctx.stroke();
  drawText(ctx, `${stats.entries.length} ${stats.entries.length === 1 ? "entrada registrada" : "entradas registradas"}`, 154, 662, {
    color: "#5a5a78",
    size: 28,
    weight: 800,
  });

  drawText(ctx, "RESUMO POR PAGAMENTO", 70, 820, {
    color: "#eaf8ff",
    size: 32,
    weight: 900,
  });

  const paymentCards = [
    ["Dinheiro", stats.totals.cash, "#ffd447", "cash"],
    ["Pix", stats.totals.pix, "#94f0dc", "pix"],
    ["Crédito", stats.totals.credit, "#c9a6ff", "credit"],
    ["Débito", stats.totals.debit, "#8cceff", "debit"],
  ];

  paymentCards.forEach((card, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 70 + column * 490;
    const y = 858 + row * 178;
    ctx.fillStyle = card[2];
    roundRect(ctx, x, y, 450, 160, 30);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#05050a";
    ctx.stroke();
    ctx.fillStyle = "rgba(5,5,10,0.14)";
    ctx.beginPath();
    ctx.arc(x + 62, y + 55, 36, 0, Math.PI * 2);
    ctx.fill();
    drawClosingPaymentIcon(ctx, card[3], x + 62, y + 55);
    drawText(ctx, card[0], x + 118, y + 66, {
      color: "#05050a",
      size: 30,
      weight: 900,
    });
    drawText(ctx, formatCurrency(card[1]), x + 34, y + 128, {
      color: "#05050a",
      size: 40,
      weight: 900,
    });
  });

  drawText(ctx, "RESUMO POR TURNO", 70, 1280, {
    color: "#eaf8ff",
    size: 32,
    weight: 900,
  });

  const shiftCards = [
    ["Manhã", stats.shiftTotals.manha, "#ffe98a"],
    ["Tarde", stats.shiftTotals.tarde, "#8bdaff"],
    ["Noite", stats.shiftTotals.noite, "#a66cff"],
  ];

  shiftCards.forEach((card, index) => {
    const x = 70 + index * 320;
    const y = 1320;
    ctx.fillStyle = card[2];
    roundRect(ctx, x, y, 292, 168, 28);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#05050a";
    ctx.stroke();
    drawText(ctx, card[0], x + 32, y + 68, {
      color: "#05050a",
      size: 29,
      weight: 900,
    });
    drawText(ctx, formatCurrency(card[1]), x + 32, y + 125, {
      color: "#05050a",
      size: 30,
      weight: 900,
    });
  });

  ctx.fillStyle = "#05050a";
  roundRect(ctx, 70, 1540, 940, 120, 28);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#19c8ff";
  ctx.stroke();
  drawText(ctx, "EVENTO DO DIA", 112, 1590, {
    color: "#b984ff",
    size: 24,
    weight: 900,
  });
  drawText(ctx, getDayEventLabel(stats.meta).slice(0, 46), 112, 1638, {
    color: "#62d9ff",
    size: 34,
    weight: 800,
  });

  drawMountains(1790, 0.82);

  ctx.fillStyle = "rgba(5,5,10,0.76)";
  roundRect(ctx, 70, 1720, 940, 92, 26);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#19c8ff";
  ctx.stroke();
  drawText(ctx, `Gerado às ${generatedAt}`, 104, 1777, {
    color: "rgba(255,255,255,0.8)",
    size: 27,
    weight: 800,
  });
  drawText(ctx, "❄", 540, 1778, {
    color: "#62d9ff",
    size: 28,
    weight: 900,
    align: "center",
  });
  drawText(ctx, "Caixa Tá No Grale", 976, 1777, {
    color: "#ffd447",
    size: 26,
    weight: 900,
    align: "right",
  });
}

function getClosingImageBlob() {
  const canvas = document.querySelector("#closing-canvas");
  if (!canvas) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
    } catch {
      resolve(null);
    }
  });
}

async function downloadClosingImage() {
  await drawClosingCanvas();
  const blob = await getClosingImageBlob();
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fechamento-caixa-${state.selectedDate}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function shareClosingImage() {
  await drawClosingCanvas();
  const blob = await getClosingImageBlob();
  if (!blob) return;

  try {
    const file = new File([blob], `fechamento-caixa-${state.selectedDate}.png`, {
      type: "image/png",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Fechamento de Caixa",
        text: buildDaySummaryMessage(state.selectedDate),
      });
      return;
    }
  } catch {
    // Navegadores sem suporte a compartilhamento de arquivos usam o download.
  }

  await downloadClosingImage();
  window.alert("Imagem baixada. Envie pelo WhatsApp ou pelo app que preferir.");
}

function renderTopbar(title, subtitle) {
  const closed = isDayClosed(state.selectedDate);
  const themeIcon = state.theme === "dark" ? icon("sun") : icon("theme");

  return `
    <header class="topbar">
      <section class="brand-hero" aria-label="Caixa Tá No Grale">
        <img class="brand-logo" src="./public/logo-adega.png" alt="Adega Tá No Grale" />
        <div class="brand-copy">
          <span class="brand-kicker">${title}</span>
          <h1>${subtitle}</h1>
          <p class="brand-date">${icon("calendar")} ${formatDate(state.selectedDate)}</p>
          <span class="brand-status ${closed ? "is-closed" : "is-open"}">${closed ? "● CAIXA FECHADO" : "● CAIXA ABERTO"}</span>
        </div>
        <div class="brand-actions">
          <button class="brand-theme-toggle" type="button" data-action="toggle-theme" title="Trocar tema" aria-label="Trocar tema">
            ${themeIcon}
          </button>
          <button class="brand-logout-toggle" type="button" data-action="sign-out-account" title="Sair da conta" aria-label="Sair da conta">
            ${icon("logout")}
          </button>
        </div>
        <span class="brand-mountains" aria-hidden="true"></span>
      </section>
    </header>
  `;
}

function renderLoginView() {
  const mode = state.accountModal.mode === "signup" ? "signup" : "login";
  const username = state.cloud.username || "";
  const busy = state.accountModal.loading || state.cloud.syncing;
  const message = state.accountModal.error || state.cloud.error || "";

  return `
    <main class="login-screen" aria-label="Acesso ao Caixa Tá No Grale">
      <div class="login-glow" aria-hidden="true"></div>
      <div class="login-mountain login-mountain-left" aria-hidden="true"></div>
      <div class="login-mountain login-mountain-right" aria-hidden="true"></div>

      <section class="login-hero">
        <img class="login-logo" src="./public/logo-adega.png" alt="Adega Tá No Grale" />
        <h1>Bem-vindo(a)!</h1>
        <p>Use um nome de usuário e uma senha de 4 dígitos. <strong>Não precisa de e-mail.</strong></p>
      </section>

      <form id="account-form" class="login-card">
        <div class="form-error ${message ? "is-visible" : ""}">${escapeHtml(message)}</div>
        <label class="login-field" for="account-username">
          <span>${icon("user")} Nome de usuário</span>
          <input id="account-username" name="username" type="text" value="${escapeHtml(username)}" autocomplete="username" placeholder="ex: adega" required />
        </label>
        <label class="login-field" for="account-pin">
          <span>${icon("lock")} Senha de 4 dígitos</span>
          <div class="pin-control">
            <input id="account-pin" name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="current-password" placeholder="0000" required />
            <button class="pin-eye" type="button" data-action="toggle-pin-visibility" aria-label="Mostrar senha">
              ${icon("eye")}
            </button>
          </div>
        </label>
        <button class="login-submit" type="submit" ${busy ? "disabled" : ""}>
          ${busy ? "Aguarde..." : mode === "signup" ? "Criar conta" : "Entrar"}
        </button>
        <button class="login-secondary" type="button" data-action="${mode === "signup" ? "account-login-mode" : "account-signup-mode"}">
          ${mode === "signup" ? "Já tenho conta" : "Primeiro acesso"}
        </button>
      </form>
    </main>
  `;
}

function renderCashView() {
  const dayEntries = entriesForDate(state.selectedDate);
  const totals = getTotals(dayEntries);
  const totalText = formatCurrency(totals.general);
  const totalLengthClass = totalText.length > 13 ? "is-long" : totalText.length > 10 ? "is-medium" : "";
  const dayMeta = getDayMeta(state.selectedDate);
  const closed = Boolean(dayMeta.closed);

  return `
    ${renderTopbar("Controle de Caixa", "Adega Tá No Grale")}

    <main>
      <section class="total-card" aria-label="Total de entradas do dia selecionado">
        <div class="total-card-main">
          <p class="eyebrow">Total do dia</p>
          <strong class="money-total ${totalLengthClass}">${totalText}</strong>
          <span class="entry-count">${icon("receipt")} ${dayEntries.length} ${dayEntries.length === 1 ? "entrada registrada" : "entradas registradas"}</span>
        </div>
        <div class="safe-illustration" aria-hidden="true">
          <img class="safe-image" src="./public/cofre-total.png" alt="" />
        </div>
      </section>

      <section class="cash-actions" aria-label="Controles do caixa">
        <button class="big-add-button" type="button" data-action="open-add" ${closed ? "disabled" : ""}>
          <span class="add-square">${icon("plus")}</span>
          <strong>Adicionar entrada</strong>
          ${icon("arrow")}
        </button>
        ${renderCalendarToggle()}
      </section>

      ${renderSummary(dayEntries, dayMeta, closed)}
    </main>
  `;
}

function renderHistoryView() {
  const days = getHistoryDays();
  const selectedEntries = state.historyDate ? entriesForDate(state.historyDate) : [];
  const selectedTotals = getTotals(selectedEntries);

  return `
    ${renderTopbar("Histórico", "Dias registrados")}

    <main>
      <div class="history-toolbar">
        <button class="btn btn-primary" type="button" data-action="open-add">
          ${icon("plus")}
          Nova entrada
        </button>
        <button class="btn btn-quiet" type="button" data-action="export-csv" ${hasExportData() ? "" : "disabled"}>
          ${icon("download")}
          Exportar histórico
        </button>
      </div>

      ${
        days.length
          ? `
            <section class="history-list" aria-label="Histórico por dia">
              ${days
                .map((day) => {
                  const meta = getDayMeta(day.date);
                  return `
                    <button class="day-card" type="button" data-action="open-history-day" data-date="${day.date}">
                      <span>
                        <strong>${formatDate(day.date)}</strong>
                        <span>${day.count} ${day.count === 1 ? "entrada" : "entradas"}</span>
                        <span class="day-card-tags">
                          ${meta.closed ? '<em class="status-pill closed">Fechado</em>' : ""}
                          ${hasDayEvent(meta) ? `<em class="status-pill event">${escapeHtml(getDayEventLabel(meta))}</em>` : ""}
                        </span>
                      </span>
                      <span class="day-card-total">${formatCurrency(day.total)}</span>
                    </button>
                  `;
                })
                .join("")}
            </section>
          `
          : `
            <div class="empty-state">
              <strong>Nenhum histórico ainda.</strong>
              As entradas salvas aparecem aqui por dia.
            </div>
          `
      }

      ${
        state.historyDate
          ? `
            <section class="history-detail">
              <div class="history-detail-head">
                <div>
                  <p class="eyebrow">Detalhes</p>
                  <h2>${formatDate(state.historyDate)}</h2>
                  ${
                    hasDayEvent(state.historyDate)
                      ? `<p class="history-note">Evento: ${escapeHtml(getDayEventLabel(state.historyDate))}</p>`
                      : ""
                  }
                </div>
                <button class="icon-btn" type="button" data-action="close-history-day" title="Voltar para historico" aria-label="Voltar para historico">
                  ${icon("back")}
                </button>
              </div>
              <div class="summary-grid">
                <div class="summary-tile">
                  <span>Dinheiro</span>
                  <strong>${formatCurrency(selectedTotals.cash)}</strong>
                </div>
                <div class="summary-tile">
                  <span>Pix</span>
                  <strong>${formatCurrency(selectedTotals.pix)}</strong>
                </div>
                <div class="summary-tile">
                  <span>Cartão</span>
                  <strong>${formatCurrency(selectedTotals.card)}</strong>
                </div>
                <div class="summary-tile total">
                  <span>Total geral</span>
                  <strong>${formatCurrency(selectedTotals.general)}</strong>
                </div>
              </div>
              ${renderEntryList(selectedEntries, false)}
            </section>
          `
          : ""
      }
    </main>
  `;
}

function renderReportsView() {
  const dayEntries = entriesForDate(state.selectedDate);
  const dayTotals = getTotals(dayEntries);

  return `
    ${renderTopbar("Relatórios", "Resumo do caixa")}

    <main class="reports-view">
      <div class="report-actions">
        <button class="btn btn-quiet" type="button" data-action="nav-cash">
          ${icon("back")}
          Voltar ao caixa
        </button>
        <button class="btn btn-quiet" type="button" data-action="export-csv" ${hasExportData() ? "" : "disabled"}>
          ${icon("download")}
          Exportar CSV
        </button>
      </div>

      ${renderPeriodSummary()}

      <section class="report-panel">
        <div class="section-title-row">
          <h2>${icon("receipt")} Hoje selecionado</h2>
          <span class="report-date">${formatDate(state.selectedDate)}</span>
        </div>
        <div class="summary-grid">
          <div class="summary-tile">
            <span>Dinheiro</span>
            <strong>${formatCurrency(dayTotals.cash)}</strong>
          </div>
          <div class="summary-tile">
            <span>Pix</span>
            <strong>${formatCurrency(dayTotals.pix)}</strong>
          </div>
          <div class="summary-tile">
            <span>Cartão</span>
            <strong>${formatCurrency(dayTotals.card)}</strong>
          </div>
          <div class="summary-tile total">
            <span>Total geral</span>
            <strong>${formatCurrency(dayTotals.general)}</strong>
          </div>
        </div>
      </section>

      <div class="report-actions">
        <button class="btn btn-secondary" type="button" data-action="share-day-summary">
          ${icon("share")}
          Compartilhar resumo
        </button>
        <button class="btn btn-primary" type="button" data-action="open-closing-image">
          ${icon("image")}
          Imagem fechamento
        </button>
      </div>
    </main>
  `;
}

function renderModal() {
  const editing = state.entries.find((entry) => entry.id === state.modal.editingId);
  const draft = !editing ? state.entryDraft : null;
  const date = editing?.date || draft?.date || state.selectedDate;
  const amount = editing
    ? formatCurrency(editing.amountCents)
    : draft?.amount || formatCurrency(0);
  const payment = editing?.payment || draft?.payment || "dinheiro";
  const shift = editing?.shift || draft?.shift || state.modal.autoShift || getShiftFromTime();
  const description = editing?.description || draft?.description || "";

  return `
    <div class="sheet-backdrop ${state.modal.open ? "is-open" : ""}" data-action="close-modal-backdrop">
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="entry-modal-title">
        <div class="sheet-head">
          <h2 id="entry-modal-title">${editing ? "Editar entrada" : "Adicionar entrada"}</h2>
          <button class="icon-btn" type="button" data-action="close-modal" title="Fechar" aria-label="Fechar">
            ${icon("close")}
          </button>
        </div>
        <form id="entry-form" class="entry-form">
          <div class="form-error ${state.modal.error ? "is-visible" : ""}">${escapeHtml(state.modal.error)}</div>
          ${
            draft
              ? `
                <div class="draft-notice">
                  Rascunho recuperado automaticamente.
                  <button type="button" data-action="discard-entry-draft">Descartar</button>
                </div>
              `
              : ""
          }
          <div class="field-stack">
            <label for="entry-date">Data da entrada</label>
            <input id="entry-date" name="date" type="date" value="${date}" required />
          </div>
          <div class="field-stack">
            <label for="entry-amount">Valor da entrada em reais</label>
            <input id="entry-amount" name="amount" type="tel" inputmode="numeric" autocomplete="off" value="${amount}" required />
          </div>
          <div class="field-stack">
            <label for="entry-payment">Forma de pagamento</label>
            <select id="entry-payment" name="payment" required>
              ${Object.entries(paymentLabels)
                .map(
                  ([value, label]) => `
                    <option value="${value}" ${payment === value ? "selected" : ""}>${label}</option>
                  `,
                )
                .join("")}
            </select>
          </div>
          <input type="hidden" name="shift" value="${shift}" />
          <div class="field-stack">
            <label for="entry-description">Descrição opcional</label>
            <textarea id="entry-description" name="description" placeholder="Venda de cerveja, Espetinho, Fiado pago...">${escapeHtml(description)}</textarea>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">
              ${icon("cash")}
              Salvar entrada
            </button>
            <button class="btn btn-quiet" type="button" data-action="close-modal">
              Cancelar
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderCloseConfirmModal() {
  const entries = entriesForDate(state.selectedDate);
  const totals = getTotals(entries);

  return `
    <div class="sheet-backdrop ${state.closeConfirm.open ? "is-open" : ""}" data-action="close-confirm-backdrop">
      <section class="sheet close-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="close-confirm-title">
        <div class="sheet-head">
          <h2 id="close-confirm-title">Fechar caixa</h2>
          <button class="icon-btn" type="button" data-action="close-confirm" title="Cancelar" aria-label="Cancelar">
            ${icon("close")}
          </button>
        </div>
        <div class="close-confirm-body">
          <p class="close-date">${icon("calendar")} ${formatDate(state.selectedDate)}</p>
          <div class="summary-grid">
            <div class="summary-tile">
              <span>Dinheiro</span>
              <strong>${formatCurrency(totals.cash)}</strong>
            </div>
            <div class="summary-tile">
              <span>Pix</span>
              <strong>${formatCurrency(totals.pix)}</strong>
            </div>
            <div class="summary-tile">
              <span>Cartão</span>
              <strong>${formatCurrency(totals.card)}</strong>
            </div>
            <div class="summary-tile total">
              <span>Total do dia</span>
              <strong>${formatCurrency(totals.general)}</strong>
            </div>
          </div>
          <p class="close-warning">Depois de fechar, novas entradas e edições ficam bloqueadas até reabrir o caixa.</p>
          <div class="form-actions">
            <button class="btn btn-quiet" type="button" data-action="close-confirm">Cancelar</button>
            <button class="btn btn-primary" type="button" data-action="confirm-day-close">
              ${icon("lock")}
              Confirmar fechamento
            </button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderClosingModal() {
  return `
    <div class="sheet-backdrop ${state.closingImage.open ? "is-open" : ""}" data-action="close-closing-backdrop">
      <section class="sheet closing-sheet" role="dialog" aria-modal="true" aria-labelledby="closing-modal-title">
        <div class="sheet-head">
          <h2 id="closing-modal-title">Imagem do fechamento</h2>
          <button class="icon-btn" type="button" data-action="close-closing-image" title="Fechar" aria-label="Fechar">
            ${icon("close")}
          </button>
        </div>
        <div class="closing-preview">
          <canvas id="closing-canvas" class="closing-canvas" width="1080" height="1920"></canvas>
        </div>
        <div class="closing-actions">
          <button class="btn btn-primary" type="button" data-action="share-closing-image">
            ${icon("share")}
            Compartilhar imagem
          </button>
          <button class="btn btn-quiet" type="button" data-action="download-closing-image">
            ${icon("download")}
            Baixar imagem
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderAccountModal() {
  const connected = Boolean(state.cloud.user);
  const mode = connected ? "connected" : state.accountModal.mode;
  const username = state.cloud.username || "";

  return `
    <div class="sheet-backdrop ${state.accountModal.open ? "is-open" : ""}" data-action="close-account-backdrop">
      <section class="sheet account-sheet" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
        <div class="sheet-head">
          <h2 id="account-modal-title">${connected ? "Conta da adega" : mode === "signup" ? "Criar conta" : "Entrar na conta"}</h2>
          <button class="icon-btn" type="button" data-action="close-account" title="Fechar" aria-label="Fechar">
            ${icon("close")}
          </button>
        </div>
        ${
          connected
            ? `
              <div class="account-connected">
                <span class="account-badge">${icon("unlock")} Conta conectada</span>
                <strong>${escapeHtml(username || "adega")}</strong>
                <p>${escapeHtml(state.cloud.syncing ? "Sincronizando dados..." : state.cloud.status)}</p>
                ${
                  state.cloud.error
                    ? `<div class="form-error is-visible">${escapeHtml(state.cloud.error)}</div>`
                    : ""
                }
                <div class="form-actions">
                  <button class="btn btn-primary" type="button" data-action="sync-now" ${state.cloud.syncing ? "disabled" : ""}>
                    ${icon("download")}
                    Atualizar dados
                  </button>
                  <button class="btn btn-quiet" type="button" data-action="sign-out-account">
                    Sair da conta
                  </button>
                </div>
              </div>
            `
            : `
              <form id="account-form" class="entry-form account-form">
                <p class="account-help">Use apenas um nome de usuario e uma senha de 4 digitos. Nao precisa de e-mail.</p>
                <div class="form-error ${state.accountModal.error ? "is-visible" : ""}">${escapeHtml(state.accountModal.error)}</div>
                <div class="field-stack">
                  <label for="account-username">Nome de usuario</label>
                  <input id="account-username" name="username" type="text" value="${escapeHtml(username)}" autocomplete="username" placeholder="ex: adega" required />
                </div>
                <div class="field-stack">
                  <label for="account-pin">Senha de 4 digitos</label>
                  <input id="account-pin" name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="current-password" placeholder="0000" required />
                </div>
                <div class="form-actions">
                  <button class="btn btn-primary" type="submit" ${state.accountModal.loading ? "disabled" : ""}>
                    ${icon(mode === "signup" ? "plus" : "lock")}
                    ${state.accountModal.loading ? "Aguarde..." : mode === "signup" ? "Criar conta" : "Entrar"}
                  </button>
                  <button class="btn btn-quiet" type="button" data-action="${mode === "signup" ? "account-login-mode" : "account-signup-mode"}">
                    ${mode === "signup" ? "Ja tenho conta" : "Criar uma conta"}
                  </button>
                </div>
              </form>
            `
        }
      </section>
    </div>
  `;
}

function renderNav() {
  const closed = isDayClosed(state.selectedDate);

  return `
    <nav class="bottom-nav" aria-label="Navegação principal">
      <div class="bottom-nav-inner">
        <button class="nav-btn ${state.view === "cash" ? "is-active" : ""}" type="button" data-action="nav-cash">
          ${icon("register")}
          <span>Caixa</span>
        </button>
        <button class="nav-btn ${state.view === "history" ? "is-active" : ""}" type="button" data-action="nav-history">
          ${icon("list")}
          <span>Histórico</span>
        </button>
        <button class="nav-btn nav-close ${closed ? "is-closed" : ""}" type="button" data-action="toggle-day-closed">
          ${icon(closed ? "unlock" : "lock")}
          <span>${closed ? "Reabrir" : "Fechar caixa"}</span>
        </button>
      </div>
    </nav>
  `;
}

function render() {
  const loggedIn = Boolean(state.cloud.user);
  app.classList?.toggle("is-auth", !loggedIn);

  if (!loggedIn) {
    app.innerHTML = renderLoginView();
    return;
  }

  const viewMarkup =
    state.view === "history"
      ? renderHistoryView()
      : state.view === "reports"
        ? renderReportsView()
        : renderCashView();

  app.innerHTML = `
    ${viewMarkup}
    ${renderModal()}
    ${renderCloseConfirmModal()}
    ${renderClosingModal()}
    ${renderNav()}
  `;

  if (state.closingImage.open) {
    scheduleClosingCanvasDraw();
  }
}

function exportCsv() {
  if (!hasExportData()) return;

  const entryDates = datesWithEntries();
  const metaOnlyRows = Object.entries(state.dayMeta)
    .filter(([date, meta]) => !entryDates.has(date) && (meta?.closed || hasDayEvent(meta)))
    .map(([date, meta]) => [
      formatDate(date),
      "",
      "",
      "",
      meta.closed ? "Fechado" : "Aberto",
      getDayEventLabel(meta),
      "",
      "",
      "0,00",
    ]);

  const rows = [
    ["Data", "Hora", "Venda", "Turno", "Status do dia", "Evento do dia", "Forma de pagamento", "Descrição", "Valor"],
    ...state.entries
      .slice()
      .sort((a, b) => `${a.date} ${formatTime(a.entryTime || a.createdAt)}`.localeCompare(`${b.date} ${formatTime(b.entryTime || b.createdAt)}`))
      .map((entry) => [
        formatDate(entry.date),
        formatTime(entry.entryTime || entry.createdAt),
        formatSaleNumber(entry.saleNumber),
        shiftLabels[entry.shift] || shiftLabels.noite,
        isDayClosed(entry.date) ? "Fechado" : "Aberto",
        getDayEventLabel(entry.date),
        paymentLabels[entry.payment] || paymentLabels.dinheiro,
        entry.description || "",
        (entry.amountCents / 100).toFixed(2).replace(".", ","),
      ]),
    ...metaOnlyRows,
  ];

  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(";"),
    )
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `historico-caixa-ta-no-grale-${getTodayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

app.addEventListener("click", (event) => {
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;

  const action = actionElement.dataset.action;
  const id = actionElement.dataset.id;
  const date = actionElement.dataset.date;

  if (action === "open-add") openAddModal();
  if (action === "open-account") openAccountModal();
  if (action === "close-account") closeAccountModal();
  if (action === "close-account-backdrop" && event.target === actionElement) closeAccountModal();
  if (action === "account-signup-mode") setAccountMode("signup");
  if (action === "account-login-mode") setAccountMode("login");
  if (action === "sign-out-account" && window.confirm("Sair desta conta?")) signOutAccount();
  if (action === "sync-now") loadCloudData();
  if (action === "toggle-pin-visibility") {
    const pinInput = document.querySelector("#account-pin");
    if (pinInput) {
      pinInput.type = pinInput.type === "password" ? "text" : "password";
      actionElement.classList.toggle("is-visible", pinInput.type === "text");
    }
  }
  if (action === "go-history" || action === "nav-history") setView("history");
  if (action === "nav-cash") setView("cash");
  if (action === "open-reports") setView("reports");
  if (action === "edit-entry") openEditModal(id);
  if (action === "delete-entry") deleteEntry(id);
  if (action === "show-more-entries") {
    state.expandedEntryDates.add(date || state.selectedDate);
    render();
  }
  if (action === "close-modal") closeModal();
  if (action === "close-modal-backdrop" && event.target === actionElement) closeModal();
  if (action === "close-confirm") closeCloseConfirm();
  if (action === "close-confirm-backdrop" && event.target === actionElement) closeCloseConfirm();
  if (action === "confirm-day-close") confirmSelectedDayClosed();
  if (action === "discard-entry-draft") discardEntryDraft();
  if (action === "toggle-theme") toggleTheme();
  if (action === "toggle-calendar") {
    state.calendarOpen = !state.calendarOpen;
    render();
  }
  if (action === "open-closing-image") openClosingImage();
  if (action === "close-closing-image") closeClosingImage();
  if (action === "close-closing-backdrop" && event.target === actionElement) closeClosingImage();
  if (action === "download-closing-image") downloadClosingImage();
  if (action === "share-closing-image") shareClosingImage();
  if (action === "toggle-day-closed") toggleSelectedDayClosed();
  if (action === "share-day-summary") shareDaySummary();
  if (action === "prev-calendar-month") {
    state.calendarMonth = addMonths(state.calendarMonth, -1);
    render();
  }
  if (action === "next-calendar-month") {
    state.calendarMonth = addMonths(state.calendarMonth, 1);
    render();
  }
  if (action === "select-calendar-date") {
    state.selectedDate = date;
    state.calendarMonth = date.slice(0, 7);
    state.calendarOpen = false;
    render();
  }
  if (action === "open-history-day") {
    state.historyDate = date;
    state.selectedDate = date;
    state.calendarMonth = date.slice(0, 7);
    render();
  }
  if (action === "close-history-day") {
    state.historyDate = null;
    render();
  }
  if (action === "export-csv") exportCsv();
});

app.addEventListener("change", (event) => {
  const entryForm = event.target.closest?.("#entry-form");
  if (entryForm) saveDraftFromForm(entryForm);

  if (event.target.id === "day-event-tag") {
    const form = event.target.closest("#day-event-form");
    const customField = form?.querySelector(".event-custom-field");
    if (customField) customField.classList.toggle("is-hidden", event.target.value !== "outro");
  }

});

app.addEventListener("input", (event) => {
  if (event.target.id === "entry-amount") {
    applyMoneyMask(event.target, event.inputType);
  }

  const entryForm = event.target.closest?.("#entry-form");
  if (entryForm) saveDraftFromForm(entryForm);
});

app.addEventListener("focusin", (event) => {
  if (event.target.id === "entry-amount") {
    applyMoneyMask(event.target);
  }
});

app.addEventListener("submit", (event) => {
  if (event.target.id === "account-form") {
    event.preventDefault();
    submitAccountForm(new FormData(event.target)).then((error) => {
      if (error) {
        state.accountModal.error = error;
        render();
      }
    });
    return;
  }

  if (event.target.id === "day-event-form") {
    event.preventDefault();
    saveSelectedDayEvent(new FormData(event.target));
    return;
  }

  if (event.target.id !== "entry-form") return;
  event.preventDefault();
  const error = upsertEntry(new FormData(event.target));
  if (error) {
    state.modal.error = error;
    render();
  } else {
    render();
  }
});

function refreshCloudIfPossible() {
  if (state.cloud.user && !state.cloud.syncing) loadCloudData();
}

render();
initializeCloud();

window.addEventListener("focus", refreshCloudIfPossible);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshCloudIfPossible();
});
