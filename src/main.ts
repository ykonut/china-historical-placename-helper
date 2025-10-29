import { invoke } from "@tauri-apps/api/core";

type PlacenameRecord = {
  id?: number;
  sysId?: string;
  nameVn?: string;
  nameEn?: string;
  nameTr?: string;
  nameAlt?: string;
  spellings?: SpellingEntry[];
  featureType?: {
    nameVn?: string;
    nameEn?: string;
  } | null;
  temporal?: {
    begYr?: number;
    endYr?: number;
  } | null;
  spatial?: {
    presentLocation?: PresentLocation[] | null;
  } | null;
};

type PresentLocation = {
  textValue?: string;
  countryCode?: string;
  source?: string;
  attestation?: string;
};

type HistoricalRelation = {
  id?: number;
  sysId?: string;
  name?: string;
  script?: string;
  begYr?: number;
  endYr?: number;
};

type SpellingEntry = {
  writtenForm?: string;
  script?: string;
  exonymLang?: string;
  attestedBy?: string;
  note?: string;
};

type TemporalInfo = {
  begYr?: number;
  endYr?: number;
  begRuleId?: number | null;
  endRuleId?: number | null;
};

type PlacenameDetail = PlacenameRecord & {
  spellings?: SpellingEntry[];
  dataSrc?: string;
  dataSource?: string;
  sourceNote?: string;
  sourceUri?: string;
  license?: string;
  reason?: string;
  reason2?: string;
  checkStatus?: number;
  temporal?: TemporalInfo | null;
  spatial?: {
    objType?: string | null;
    presentLocation?: PresentLocation[] | null;
    source?: string | null;
    xcoord?: string | null;
    ycoord?: string | null;
    xyType?: string | null;
  } | null;
  historicalContext?: {
    partOf?: HistoricalRelation[] | null;
    subordinateUnits?: HistoricalRelation[] | null;
    precededBy?: HistoricalRelation[] | null;
    later?: HistoricalRelation[] | null;
  } | null;
};

type SearchResponse = {
  total?: number;
  size?: number;
  pages?: number;
  current?: number;
  records?: PlacenameRecord[];
};

type SearchEnvelope = {
  resp_code?: number;
  resp_msg?: string;
  datas?: SearchResponse;
};

type DetailMode = "basic" | "source" | "raw";
type SearchMode = "criteria" | "sysId";

const modeLabels: Record<DetailMode, string> = {
  basic: "详情",
  source: "数据来源",
  raw: "原始 JSON",
};

const form = document.querySelector<HTMLFormElement>("#search-form");
const statusEl = document.querySelector<HTMLSpanElement>("#query-status");
const resultsEl = document.querySelector<HTMLDivElement>("#results");
const searchModeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("#search-mode button"),
);
const criteriaFields = document.querySelector<HTMLDivElement>(".criteria-fields");
const sysIdFields = document.querySelector<HTMLDivElement>(".sysid-fields");
const sysIdInput = document.querySelector<HTMLInputElement>('input[name="sysId"]');
const formActions = document.querySelector<HTMLDivElement>(".form-actions");
const detailTabButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("#details-tabs button"),
);
const detailsBasic = document.querySelector<HTMLDivElement>("#details-basic");
const detailsSourcePanel = document.querySelector<HTMLDivElement>("#details-source");
const detailsRaw = document.querySelector<HTMLPreElement>("#details-raw");
const detailsRawCode = detailsRaw?.querySelector<HTMLElement>("code");

const detailCache = new Map<string, PlacenameDetail>();
let activeRecord: PlacenameRecord | null = null;
let activeDetail: PlacenameDetail | null = null;
let activeMode: DetailMode = "basic";
let activeSearchMode: SearchMode = "criteria";

const STATUS_LABELS: Record<number, string> = {
  0: "审核中",
  1: "已通过",
  2: "未通过",
};

type CriteriaQuery = {
  name?: string;
  year?: number;
};

let criteriaQuery: CriteriaQuery | null = null;
let criteriaPage = 0;
let criteriaLimit = 10;
let criteriaTotal = 0;
let criteriaPages = 1;

function setStatus(message: string, variant: "info" | "error" | "success" = "info") {
  if (!statusEl) return;
  if (message.trim().length === 0) {
    statusEl.textContent = "";
    delete statusEl.dataset.variant;
    return;
  }

  statusEl.textContent = message;
  statusEl.dataset.variant = variant;
}

function sanitizeInput(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function setActiveTab(mode: DetailMode) {
  activeMode = mode;
  detailTabButtons.forEach((button) => {
    const buttonMode = button.dataset.mode as DetailMode | undefined;
    if (!buttonMode) return;
    const isActive = buttonMode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  if (detailsBasic) {
    detailsBasic.hidden = mode !== "basic";
  }
  if (detailsSourcePanel) {
    detailsSourcePanel.hidden = mode !== "source";
  }
  if (detailsRaw) {
    detailsRaw.hidden = mode !== "raw";
  }
}

function setSearchMode(mode: SearchMode) {
  activeSearchMode = mode;

  searchModeButtons.forEach((button) => {
    const buttonMode = button.dataset.mode as SearchMode | undefined;
    if (!buttonMode) return;
    const isActive = buttonMode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  if (criteriaFields) {
    criteriaFields.hidden = mode !== "criteria";
    criteriaFields.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.disabled = mode !== "criteria";
    });
  }

  if (sysIdFields) {
    sysIdFields.hidden = mode !== "sysId";
    sysIdFields.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.disabled = mode !== "sysId";
    });
  }

  if (formActions) {
    if (mode === "sysId" && sysIdFields) {
      sysIdFields.appendChild(formActions);
    } else if (criteriaFields) {
      criteriaFields.appendChild(formActions);
    }
  }

  if (mode === "sysId" && sysIdInput) {
    sysIdInput.focus();
    sysIdInput.select();
  }

  if (mode === "criteria" && sysIdInput) {
    sysIdInput.value = "";
  }

  if (mode !== "criteria" && resultsEl) {
    resultsEl.querySelectorAll<HTMLElement>(".results-controls").forEach((element) => {
      element.remove();
    });
  }

  setStatus("");
}

function renderEmptyState(mode: DetailMode) {
  if (!detailsBasic || !detailsSourcePanel || !detailsRaw || !detailsRawCode) return;

  detailsBasic.hidden = mode !== "basic";
  detailsSourcePanel.hidden = mode !== "source";
  detailsRaw.hidden = mode !== "raw";

  if (mode === "basic") {
    detailsBasic.innerHTML = "";
    detailsBasic.setAttribute("data-empty", "");
    detailsBasic.textContent = "请选择一条记录查看详细信息。";
  } else {
    detailsBasic.setAttribute("data-empty", "");
  }

  if (mode === "source") {
    detailsSourcePanel.textContent = "暂无数据。";
  }

  if (mode === "raw") {
    detailsRawCode.textContent = "请选择一条记录查看原始 JSON。";
  }
}

function resetDetailView() {
  activeRecord = null;
  activeDetail = null;

  setActiveTab("basic");
  renderEmptyState("basic");

  if (detailsSourcePanel) {
    detailsSourcePanel.textContent = "暂无数据。";
  }
  if (detailsRaw && detailsRawCode) {
    detailsRawCode.textContent = "请选择一条记录查看原始 JSON。";
  }
}

function formatYearShort(year?: number | null): string {
  if (year === undefined || year === null) return "";
  if (year < 0) return `前${Math.abs(year)}`;
  if (year === 0) return "0";
  return String(year);
}

function formatPeriodShort(temporal?: { begYr?: number; endYr?: number } | null): string {
  if (!temporal) return "—";
  const start = formatYearShort(temporal.begYr);
  const end = formatYearShort(temporal.endYr);
  const hasStart = start.length > 0;
  const hasEnd = end.length > 0;

  if (hasStart && hasEnd) {
    return start === end ? start : `${start} - ${end}`;
  }
  if (hasStart) return `${start} 起`;
  if (hasEnd) return `至 ${end}`;
  return "—";
}

function extractTextFromHtml(input?: string | null): string | undefined {
  if (!input) return undefined;
  const temp = document.createElement("div");
  temp.innerHTML = input;
  const text = temp.innerText.trim();
  return text.length > 0 ? text : undefined;
}

type NameVariants = {
  simplified: string;
  traditional: string;
  pinyin: string;
};

function cleanText(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickSpellingEntry(
  spellings: SpellingEntry[] | undefined | null,
  predicate: (entry: SpellingEntry) => boolean,
): SpellingEntry | undefined {
  if (!spellings) return undefined;
  return spellings.find(predicate);
}

function collectNameVariants(record: PlacenameRecord, detail?: PlacenameDetail): NameVariants {
  const combinedSpellings = [...(detail?.spellings ?? []), ...(record.spellings ?? [])];

  const simplifiedEntry = pickSpellingEntry(combinedSpellings, (entry) =>
    /简体|simplified|hans/i.test(entry.script ?? "") || /简体|简化/i.test(entry.note ?? ""),
  );
  const traditionalEntry = pickSpellingEntry(combinedSpellings, (entry) =>
    /繁体|traditional|hant/i.test(entry.script ?? "") || /繁体|繁體/i.test(entry.note ?? ""),
  );
  const pinyinEntry = pickSpellingEntry(combinedSpellings, (entry) =>
    /拼音|pinyin/i.test(entry.script ?? "") || /拼音|pinyin/i.test(entry.exonymLang ?? "") || /拼音/i.test(entry.note ?? ""),
  );

  const simplified =
    cleanText(simplifiedEntry?.writtenForm) ??
    cleanText(detail?.nameVn) ??
    cleanText(record.nameVn) ??
    cleanText(detail?.nameEn) ??
    cleanText(record.nameEn) ??
    cleanText(detail?.sysId ?? record.sysId) ??
    "—";

  const traditional =
    cleanText(traditionalEntry?.writtenForm) ??
    cleanText(detail?.nameEn) ??
    cleanText(record.nameEn) ??
    "—";

  const pinyin =
    cleanText(pinyinEntry?.writtenForm) ??
    cleanText((detail as PlacenameRecord | undefined)?.nameTr) ??
    cleanText(record.nameTr) ??
    "—";

  return { simplified, traditional, pinyin };
}

function getSimplifiedName(record: PlacenameRecord, detail?: PlacenameDetail): string {
  return collectNameVariants(record, detail).simplified;
}

function summarizeRecordLocation(record: PlacenameRecord, detail?: PlacenameDetail): string | undefined {
  const locations = detail?.spatial?.presentLocation ?? record.spatial?.presentLocation ?? [];
  const unique = new Set<string>();

  locations
    ?.filter((location) => location && location.textValue)
    .forEach((location) => {
      const text = cleanText(location.textValue);
      if (text) unique.add(text);
    });

  if (unique.size === 0) return undefined;
  return Array.from(unique).join(" / ");
}

function createDetailSection(label: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "detail-section";
  const heading = document.createElement("h3");
  heading.textContent = label;
  section.appendChild(heading);
  return section;
}

function appendEmptyLine(section: HTMLElement, message = "暂无数据") {
  const empty = document.createElement("p");
  empty.className = "detail-line";
  empty.textContent = message;
  section.appendChild(empty);
}

function createQueryButton(sysId: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "query-button";
  button.textContent = "🔍";
  button.title = `使用 ID ${sysId} 查询`;
  button.setAttribute("aria-label", `使用 ID ${sysId} 查询`);

  button.addEventListener("click", async () => {
    if (!sysIdInput) return;
    sysIdInput.value = sysId;
    setSearchMode("sysId");

    if (!form) return;
    const submitEvent = new SubmitEvent("submit", { submitter: button, cancelable: true });
    form.dispatchEvent(submitEvent);
  });

  return button;
}

function renderNameSection(variants: NameVariants): HTMLElement {
  const section = createDetailSection("名称");
  const list = document.createElement("ul");
  list.className = "detail-list detail-name-list";

  const entries: Array<[string, string]> = [
    ["简体", variants.simplified],
    ["繁体", variants.traditional],
    ["拼音", variants.pinyin],
  ];

  entries.forEach(([label, value]) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.className = "detail-item-text";
    const labelSpan = document.createElement("span");
    labelSpan.className = "detail-item-label";
    labelSpan.textContent = label;
    text.append(labelSpan, `：${value || "—"}`);
    li.appendChild(text);
    list.appendChild(li);
  });

  section.appendChild(list);
  return section;
}

function renderCoordinateSection(detail: PlacenameDetail): HTMLElement {
  const section = createDetailSection("坐标");
  const x = cleanText(detail.spatial?.xcoord);
  const y = cleanText(detail.spatial?.ycoord);

  if (!x && !y) {
    appendEmptyLine(section);
    return section;
  }

  const line = document.createElement("p");
  line.className = "detail-line";
  const parts: string[] = [];
  if (x) parts.push(`东经 ${x}`);
  if (y) parts.push(`北纬 ${y}`);
  line.textContent = parts.join(" · ");
  section.appendChild(line);
  return section;
}

function renderLocationSection(locations?: PresentLocation[] | null): HTMLElement {
  const section = createDetailSection("当前位置");
  const entries = (locations ?? []).filter((location) => cleanText(location?.textValue) || cleanText(location?.countryCode));

  if (entries.length === 0) {
    appendEmptyLine(section);
    return section;
  }

  const list = document.createElement("ul");
  list.className = "detail-list";

  entries.forEach((location) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.className = "detail-item-text";
    const countryCode = cleanText(location.countryCode)?.toUpperCase();
    const displayName = cleanText(location.textValue);
    const parts = [countryCode, displayName]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    text.textContent = parts || "—";
    li.appendChild(text);
    list.appendChild(li);
  });

  section.appendChild(list);
  return section;
}

function renderRelationSection(label: string, relations?: HistoricalRelation[] | null): HTMLElement {
  const section = createDetailSection(label);
  const items = (relations ?? []).filter((item) => item && (item.name || item.script || item.sysId));

  if (items.length === 0) {
    appendEmptyLine(section);
    return section;
  }

  const list = document.createElement("ul");
  list.className = "detail-list";

  items.forEach((item) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.className = "detail-item-text";
    const name = cleanText(item.name);
    const baseText = name ?? cleanText(item.sysId) ?? "—";
    const period = formatPeriodShort({ begYr: item.begYr, endYr: item.endYr });
    const displayText = period && period !== "—" ? `${baseText}（${period}）` : baseText;

    text.textContent = displayText;
    if (item.script && cleanText(item.script)) {
      text.title = cleanText(item.script)!;
    }

    li.appendChild(text);

    if (item.sysId) {
      li.appendChild(createQueryButton(item.sysId));
    }

    list.appendChild(li);
  });

  section.appendChild(list);
  return section;
}

function getPrimaryName(record: PlacenameRecord, detail?: PlacenameDetail): string {
  return getSimplifiedName(record, detail) || "未命名";
}

type RenderResultsOptions = {
  pagination?: {
    current: number;
    totalPages: number;
    pageSize: number;
    totalRecords: number;
  };
};

function renderResults(data: SearchResponse, options: RenderResultsOptions = {}) {
  if (!resultsEl) return;
  resultsEl.innerHTML = "";
  resetDetailView();

  const pagination = options.pagination;
  const total = pagination?.totalRecords ?? data.total ?? 0;
  const pageSize =
    pagination?.pageSize ??
    (data.size && data.size > 0
      ? data.size
      : Math.max(data.records?.length ?? 1, 1));
  const pages = pagination?.totalPages ?? (data.pages ?? Math.max(Math.ceil(total / pageSize), 1));

  if (!data.records || data.records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "未找到匹配的地名。";
    resultsEl.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "results-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["ID", "历史地名", "当前位置", "类型", "年代", "详情"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  data.records.forEach((record) => {
    const row = document.createElement("tr");

    const idCell = document.createElement("td");
    const idText = record.sysId ?? (record.id ? String(record.id) : "—");
    idCell.textContent = idText;
    row.appendChild(idCell);

    const nameCell = document.createElement("td");
    nameCell.textContent = getPrimaryName(record);
    row.appendChild(nameCell);

    const locationCell = document.createElement("td");
    const locationSummary = summarizeRecordLocation(record);
    if (locationSummary) {
      locationCell.textContent = locationSummary;
    } else if (record.sysId) {
      locationCell.textContent = "加载中…";
      const sysIdForCell = record.sysId;
      locationCell.dataset.sysId = sysIdForCell;
      void ensureDetail(record)
        .then((detail) => {
          if (!locationCell.isConnected) return;
          if (locationCell.dataset.sysId !== sysIdForCell) return;
          const detailSummary = summarizeRecordLocation(record, detail);
          locationCell.textContent = detailSummary ?? "—";
        })
        .catch(() => {
          if (!locationCell.isConnected) return;
          if (locationCell.dataset.sysId !== sysIdForCell) return;
          locationCell.textContent = "—";
        });
    } else {
      locationCell.textContent = "—";
    }
    row.appendChild(locationCell);

    const typeCell = document.createElement("td");
    typeCell.textContent = record.featureType?.nameVn ?? record.featureType?.nameEn ?? "未知";
    row.appendChild(typeCell);

    const periodCell = document.createElement("td");
    periodCell.textContent = formatPeriodShort(record.temporal ?? null);
    row.appendChild(periodCell);

    const actionsCell = document.createElement("td");
    actionsCell.className = "actions";

    const detailBtn = document.createElement("button");
    detailBtn.type = "button";
    detailBtn.textContent = "🔍";
    detailBtn.className = "primary";
    detailBtn.addEventListener("click", () => handleRecordAction(record, "basic"));
    actionsCell.appendChild(detailBtn);

    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "table-wrapper";
  tableWrapper.appendChild(table);
  resultsEl.appendChild(tableWrapper);

  if (activeSearchMode === "criteria" && criteriaQuery) {
    const controls = buildPaginationControls(total, pages);
    if (controls) {
      resultsEl.appendChild(controls);
    }
  } else {
    const summary = document.createElement("div");
    summary.className = "results-summary solo";
    summary.textContent = `共 ${total} 条记录`;
    resultsEl.appendChild(summary);
  }
}

function buildPaginationControls(total: number, totalPages: number): HTMLElement | null {
  if (!criteriaQuery) return null;

  const controls = document.createElement("div");
  controls.className = "results-controls";

  const sizeLabel = document.createElement("label");
  sizeLabel.className = "page-size";

  const sizeText = document.createElement("span");
  sizeText.textContent = "每页条数";
  sizeLabel.appendChild(sizeText);

  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.value = String(criteriaLimit);

  let isStepAction = false;

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      isStepAction = true;
      const currentValue = Number(input.value) || criteriaLimit;
      const newValue = currentValue < 10 ? 10 : Math.floor(currentValue / 10) * 10 + 10;
      input.value = String(newValue);
      criteriaLimit = newValue;
      criteriaPage = 0;
      void runCriteriaSearch();
      setTimeout(() => { isStepAction = false; }, 0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      isStepAction = true;
      const currentValue = Number(input.value) || criteriaLimit;
      const newValue = currentValue <= 10 ? 1 : Math.ceil(currentValue / 10 - 1) * 10;
      input.value = String(newValue);
      criteriaLimit = newValue;
      criteriaPage = 0;
      void runCriteriaSearch();
      setTimeout(() => { isStepAction = false; }, 0);
    }
  });

  // 处理点击上下箭头按钮
  let lastValue = criteriaLimit;
  input.addEventListener("input", () => {
    if (isStepAction) return; // 跳过键盘箭头键触发的input事件

    const currentValue = Number(input.value);
    if (!Number.isFinite(currentValue)) {
      lastValue = criteriaLimit;
      return;
    }

    // 检测是否是通过点击箭头按钮改变的（通常是+1或-1的变化）
    if (Math.abs(currentValue - lastValue) === 1) {
      isStepAction = true;
      if (currentValue > lastValue) {
        const newValue = lastValue < 10 ? 10 : Math.floor(lastValue / 10) * 10 + 10;
        input.value = String(newValue);
        lastValue = newValue;
      } else {
        const newValue = lastValue <= 10 ? 1 : Math.ceil(lastValue / 10 - 1) * 10;
        input.value = String(newValue);
        lastValue = newValue;
      }
      setTimeout(() => { isStepAction = false; }, 0);
    } else {
      lastValue = currentValue;
    }
  });

  input.addEventListener("change", () => {
    const nextLimit = Number(input.value);
    if (!Number.isFinite(nextLimit) || nextLimit <= 0) {
      input.value = String(criteriaLimit);
      lastValue = criteriaLimit;
      return;
    }
    if (nextLimit === criteriaLimit) return;
    criteriaLimit = nextLimit;
    lastValue = nextLimit;
    criteriaPage = 0;
    void runCriteriaSearch();
  });
  sizeLabel.appendChild(input);
  controls.appendChild(sizeLabel);

  const paginationGroup = document.createElement("div");
  paginationGroup.className = "pagination-group";

  const pageInfo = document.createElement("span");
  pageInfo.className = "page-info";
  const normalizedTotalPages = Math.max(totalPages, 1);
  const displayPage = criteriaTotal === 0 ? 0 : criteriaPage + 1;
  pageInfo.textContent = `第 ${displayPage} / ${normalizedTotalPages} 页`;
  paginationGroup.appendChild(pageInfo);

  const buttons = document.createElement("div");
  buttons.className = "pagination-buttons";

  const summary = document.createElement("span");
  summary.className = "results-summary";
  summary.textContent = `共 ${total} 条记录`;
  buttons.appendChild(summary);

  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.textContent = "上一页";
  prevButton.disabled = criteriaPage <= 0 || criteriaTotal === 0;
  prevButton.addEventListener("click", () => {
    if (criteriaPage <= 0) return;
    criteriaPage -= 1;
    void runCriteriaSearch();
  });
  buttons.appendChild(prevButton);

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.textContent = "下一页";
  const maxPages = Math.max(criteriaPages, 1);
  nextButton.disabled = criteriaTotal === 0 || criteriaPage + 1 >= maxPages;
  nextButton.addEventListener("click", () => {
    if (criteriaPage + 1 >= Math.max(criteriaPages, 1)) return;
    criteriaPage += 1;
    void runCriteriaSearch();
  });
  buttons.appendChild(nextButton);

  paginationGroup.appendChild(buttons);
  controls.appendChild(paginationGroup);

  return controls;
}

async function runCriteriaSearch(): Promise<void> {
  if (!criteriaQuery) return;

  setStatus("正在查询…", "info");

  try {
    const requestedPage = criteriaPage;
    const payload = {
      name: criteriaQuery.name,
      year: criteriaQuery.year,
      limit: criteriaLimit,
      page: criteriaPage + 1, // API expects a 1-based page number.
    };

    const envelope = await invoke<SearchEnvelope>("search_placenames", { query: payload });
    const data = envelope?.datas;

    if ((envelope?.resp_code ?? 0) !== 0) {
      throw new Error(envelope?.resp_msg ?? "查询失败");
    }

    if (!data) {
      throw new Error("API 未返回数据。");
    }

    criteriaTotal = data.total ?? 0;
    const sizeFromData = data.size && data.size > 0 ? data.size : criteriaLimit;
    criteriaLimit = sizeFromData;
    const pagesFromData = data.pages;
    if (typeof pagesFromData === "number" && pagesFromData > 0) {
      criteriaPages = pagesFromData;
    } else {
      criteriaPages = Math.max(Math.ceil(criteriaTotal / Math.max(criteriaLimit, 1)), 1);
    }

    const currentFromData = data.current;
    const normalizedFromResponse = (() => {
      if (typeof currentFromData === "number" && Number.isFinite(currentFromData)) {
        if (currentFromData >= 1) return currentFromData - 1;
        if (currentFromData >= 0) return currentFromData;
      }
      return requestedPage;
    })();
    const maxIndex = Math.max(criteriaPages - 1, 0);
    criteriaPage = Math.min(Math.max(normalizedFromResponse, 0), maxIndex);

    renderResults(data, {
      pagination: {
        current: criteriaTotal === 0 ? 0 : criteriaPage + 1,
        totalPages: Math.max(criteriaPages, 1),
        pageSize: criteriaLimit,
        totalRecords: criteriaTotal,
      },
    });

    setStatus("");
  } catch (error) {
    if (resultsEl) {
      resultsEl.innerHTML = "";
    }
    resetDetailView();
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function ensureDetail(record: PlacenameRecord): Promise<PlacenameDetail> {
  if (!record.sysId) {
    throw new Error("记录缺少 sysId，无法获取详情。");
  }
  const cached = detailCache.get(record.sysId);
  if (cached) return cached;
  const detail = await invoke<PlacenameDetail>("get_placename", { sysId: record.sysId });
  detailCache.set(record.sysId, detail);
  return detail;
}
function renderBasic(record: PlacenameRecord, detail: PlacenameDetail) {
  if (!detailsBasic || !detailsSourcePanel || !detailsRaw || !detailsRawCode) return;

  detailsBasic.hidden = false;
  detailsSourcePanel.hidden = true;
  detailsRaw.hidden = true;

  detailsBasic.removeAttribute("data-empty");
  detailsBasic.innerHTML = "";

  const variants = collectNameVariants(record, detail);
  const displayName = variants.simplified !== "—"
    ? variants.simplified
    : detail.sysId ?? record.sysId ?? "未命名";

  const header = document.createElement("div");
  header.className = "detail-header";

  const titleRow = document.createElement("div");
  titleRow.className = "detail-title-row";

  const nameEl = document.createElement("h3");
  nameEl.className = "detail-name";
  nameEl.textContent = displayName;
  titleRow.appendChild(nameEl);

  const sysId = detail.sysId ?? record.sysId;
  if (sysId) {
    const idBadge = document.createElement("span");
    idBadge.className = "detail-id-badge";
    idBadge.textContent = sysId;
    titleRow.appendChild(idBadge);
  }

  header.appendChild(titleRow);

  const meta = document.createElement("div");
  meta.className = "detail-meta";

  const secondaryMetaLine = document.createElement("div");
  secondaryMetaLine.className = "detail-meta-line secondary";

  if (detail.checkStatus !== undefined) {
    const statusLabel = STATUS_LABELS[detail.checkStatus] ?? String(detail.checkStatus);
    const statusSpan = document.createElement("span");
    statusSpan.textContent = `审核状态：${statusLabel}`;
    secondaryMetaLine.appendChild(statusSpan);
  }

  const dataSourceText = [detail.dataSrc, detail.dataSource]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value && value.length > 0)
    .join(" · ");
  if (dataSourceText) {
    const sourceSpan = document.createElement("span");
    sourceSpan.textContent = `数据来源：${dataSourceText}`;
    secondaryMetaLine.appendChild(sourceSpan);
  }

  const spatialSource = cleanText(detail.spatial?.source);
  if (spatialSource) {
    const spatialSpan = document.createElement("span");
    spatialSpan.textContent = `空间数据：${spatialSource}`;
    secondaryMetaLine.appendChild(spatialSpan);
  }

  const license = cleanText(detail.license);
  if (license) {
    const licenseSpan = document.createElement("span");
    licenseSpan.textContent = `许可：${license}`;
    secondaryMetaLine.appendChild(licenseSpan);
  }

  const sourceUri = cleanText(detail.sourceUri);
  if (sourceUri) {
    const linkSpan = document.createElement("span");
    const link = document.createElement("a");
    link.href = sourceUri;
    link.textContent = "查看链接";
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    linkSpan.append("链接：", link);
    secondaryMetaLine.appendChild(linkSpan);
  }

  const reasonText = cleanText(detail.reason);
  if (reasonText) {
    const reasonSpan = document.createElement("span");
    reasonSpan.textContent = `未通过原因：${reasonText}`;
    secondaryMetaLine.appendChild(reasonSpan);
  }

  const reason2Text = cleanText(detail.reason2);
  if (reason2Text) {
    const reason2Span = document.createElement("span");
    reason2Span.textContent = `禁用原因：${reason2Text}`;
    secondaryMetaLine.appendChild(reason2Span);
  }

  if (secondaryMetaLine.childElementCount > 0) {
    meta.appendChild(secondaryMetaLine);
  }

  if (meta.childElementCount > 0) {
    header.appendChild(meta);
  }

  detailsBasic.appendChild(header);
  const body = document.createElement("div");
  body.className = "detail-body";

  body.appendChild(renderNameSection(variants));

  const geoPair = document.createElement("div");
  geoPair.className = "detail-pair";
  geoPair.appendChild(renderLocationSection(detail.spatial?.presentLocation ?? null));
  geoPair.appendChild(renderCoordinateSection(detail));
  body.appendChild(geoPair);

  const hierarchyPair = document.createElement("div");
  hierarchyPair.className = "detail-pair";
  hierarchyPair.appendChild(renderRelationSection("上级单位", detail.historicalContext?.partOf));
  hierarchyPair.appendChild(renderRelationSection("下级单位", detail.historicalContext?.subordinateUnits));
  body.appendChild(hierarchyPair);

  const lineagePair = document.createElement("div");
  lineagePair.className = "detail-pair";
  lineagePair.appendChild(renderRelationSection("前世地名", detail.historicalContext?.precededBy));
  lineagePair.appendChild(renderRelationSection("后世地名", detail.historicalContext?.later));
  body.appendChild(lineagePair);

  detailsBasic.appendChild(body);
}

function renderSource(detail: PlacenameDetail) {
  if (!detailsBasic || !detailsSourcePanel || !detailsRaw || !detailsRawCode) return;

  detailsBasic.hidden = true;
  detailsSourcePanel.hidden = false;
  detailsRaw.hidden = true;

  detailsSourcePanel.innerHTML = "";

  const sourceNote = extractTextFromHtml(detail.sourceNote);
  if (sourceNote) {
    const note = document.createElement("div");
    note.className = "source-note";
    note.textContent = sourceNote;
    detailsSourcePanel.appendChild(note);
  } else {
    detailsSourcePanel.textContent = "暂无来源说明。";
  }
}

function highlightJson(value: unknown): string {
  const jsonString = JSON.stringify(value, null, 2);
  if (!jsonString) return "";

  const escaped = jsonString
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const tokenPattern = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:?)|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

  return escaped.replace(tokenPattern, (match) => {
    if (/^".*":$/.test(match)) {
      return `<span class="json-key">${match}</span>`;
    }
    if (match.startsWith('"')) {
      return `<span class="json-string">${match}</span>`;
    }
    if (/true|false/.test(match)) {
      return `<span class="json-boolean">${match}</span>`;
    }
    if (match === "null") {
      return `<span class="json-null">${match}</span>`;
    }
    return `<span class="json-number">${match}</span>`;
  });
}

function renderRaw(detail: PlacenameDetail) {
  if (!detailsBasic || !detailsSourcePanel || !detailsRaw || !detailsRawCode) return;

  detailsBasic.hidden = true;
  detailsSourcePanel.hidden = true;
  detailsRaw.hidden = false;

  const highlighted = highlightJson(detail);
  if (highlighted) {
    detailsRawCode.innerHTML = highlighted;
  } else {
    detailsRawCode.textContent = JSON.stringify(detail, null, 2) ?? "";
  }
}

function renderDetail(mode: DetailMode, record: PlacenameRecord, detail: PlacenameDetail) {
  switch (mode) {
    case "basic":
      renderBasic(record, detail);
      break;
    case "source":
      renderSource(detail);
      break;
    case "raw":
      renderRaw(detail);
      break;
  }
}

async function handleRecordAction(record: PlacenameRecord, mode: DetailMode = "basic") {
  if (!record.sysId) return;

  const previousRecord = activeRecord;
  const previousDetail = activeDetail;
  const previousMode = activeMode;

  const label = modeLabels[mode] ?? "详情";
  const displayName = record.nameVn ?? record.nameEn ?? record.sysId;
  const loadingMessage = `正在加载 ${displayName} 的${label}…`;

  setActiveTab(mode);
  if (mode === "basic" && detailsBasic) {
    detailsBasic.innerHTML = "";
    detailsBasic.setAttribute("data-empty", "");
    detailsBasic.textContent = "正在加载…";
    detailsBasic.hidden = false;
    if (detailsSourcePanel) detailsSourcePanel.hidden = true;
    if (detailsRaw) detailsRaw.hidden = true;
  } else if (mode === "source" && detailsSourcePanel) {
    detailsSourcePanel.hidden = false;
    detailsSourcePanel.textContent = "正在加载…";
    if (detailsBasic) detailsBasic.hidden = true;
    if (detailsRaw) detailsRaw.hidden = true;
  } else if (mode === "raw" && detailsRaw && detailsRawCode) {
    detailsRaw.hidden = false;
    detailsRawCode.textContent = "正在加载…";
    if (detailsBasic) detailsBasic.hidden = true;
    if (detailsSourcePanel) detailsSourcePanel.hidden = true;
  }

  setStatus(loadingMessage, "info");

  try {
    const detail = await ensureDetail(record);
    activeRecord = record;
    activeDetail = detail;

    renderDetail(mode, record, detail);

    if (statusEl && statusEl.textContent === loadingMessage) {
      setStatus("");
    }
  } catch (error) {
    if (previousRecord && previousDetail) {
      setActiveTab(previousMode);
      renderDetail(previousMode, previousRecord, previousDetail);
      activeRecord = previousRecord;
      activeDetail = previousDetail;
    } else {
      resetDetailView();
    }
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function handleSubmit(event: SubmitEvent) {
  event.preventDefault();
  if (!form) return;

  const formData = new FormData(form);
  if (activeSearchMode === "sysId") {
    const sysId = sanitizeInput(formData.get("sysId"));
    if (!sysId) {
      setStatus("请输入 SysId。", "error");
      if (sysIdInput) {
        sysIdInput.focus();
      }
      return;
    }

    setStatus(`正在查询 SysId ${sysId}…`, "info");

    try {
      const detail = await invoke<PlacenameDetail>("get_placename", { sysId });
      if (!detail) {
        throw new Error("未找到对应地名。");
      }

      const record: PlacenameRecord = detail;
      if (detail.sysId) {
        detailCache.set(detail.sysId, detail);
      }

      const response: SearchResponse = {
        total: 1,
        size: 1,
        pages: 1,
        current: 1,
        records: [record],
      };

      renderResults(response);
      await handleRecordAction(record, "basic");
      setStatus("查询成功。", "success");
    } catch (error) {
      if (resultsEl) {
        resultsEl.innerHTML = "";
      }
      resetDetailView();
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }

    return;
  }

  criteriaQuery = {
    name: sanitizeInput(formData.get("name")),
    year: parseNumber(formData.get("year")),
  };
  criteriaPage = 0;

  await runCriteriaSearch();
}

window.addEventListener("DOMContentLoaded", () => {
  resetDetailView();

  setSearchMode(activeSearchMode);

  searchModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode as SearchMode | undefined;
      if (!mode || mode === activeSearchMode) return;
      setSearchMode(mode);
    });
  });

  detailTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode as DetailMode | undefined;
      if (!mode) return;
      setActiveTab(mode);
      if (activeRecord && activeDetail) {
        renderDetail(mode, activeRecord, activeDetail);
      } else {
        renderEmptyState(mode);
      }
    });
  });

  if (!form) return;
  form.addEventListener("submit", handleSubmit);
});
