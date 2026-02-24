const CONTACT_STORAGE_KEY = "portfolio_contact_v1";
const STORAGE_KEY = "portfolio_projects_v1";
const HERO_STORAGE_KEY = "portfolio_hero_content_v1";

const defaultContact = {
  email: "opokuamanorsolomon@gmail.com",
  whatsapp: "",
  linkedin: "",
  instagram: "",
  tiktok: ""
};

const defaultHeroContent = {
  headline: "I design and ship digital products that feel premium and perform at scale.",
  lead: "A modern portfolio with a built-in admin dashboard to publish your deployed projects in seconds.",
  focus_title: "Current Focus",
  focus_items: ["Frontend architecture", "UI performance optimization", "Fullstack product launches"]
};

const supabaseUrl = window.SUPABASE_URL || "";
const supabaseAnonKey = window.SUPABASE_ANON_KEY || "";
const projectsTable = window.SUPABASE_PROJECTS_TABLE || "projects";
const contactTable = window.SUPABASE_CONTACT_TABLE || "contact_settings";
const supportTable = window.SUPABASE_SUPPORT_TABLE || "support_records";
const heroTable = window.SUPABASE_HERO_TABLE || "hero_content";
const storageBucket = window.SUPABASE_STORAGE_BUCKET || "project-images";
const supabaseReady = Boolean(window.supabase && supabaseUrl && supabaseAnonKey);
const supabaseClient = supabaseReady ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

let editingProjectId = null;
let editingProjectImageUrl = "";
let removeImageRequested = false;
let currentProjects = [];
let currentUser = null;
let supportsProjectExtras = true;
let adminProjectSearchTerm = "";
let supportRecords = [];
let activeSupportStatusFilter = "all";

function parseTags(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeProject(project, index = 0) {
  const tags = Array.isArray(project.tags) ? project.tags : parseTags(project.tags || "");
  return {
    ...project,
    tags,
    image_url: project.image_url || "",
    display_order: Number.isFinite(Number(project.display_order)) ? Number(project.display_order) : index
  };
}

function getLocalContactDetails() {
  const raw = localStorage.getItem(CONTACT_STORAGE_KEY);
  if (!raw) return { ...defaultContact };

  try {
    const parsed = JSON.parse(raw);
    return { ...defaultContact, ...parsed };
  } catch {
    return { ...defaultContact };
  }
}

function saveLocalContactDetails(contact) {
  const safeContact = { ...defaultContact, ...contact };
  localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(safeContact));
}

function getLocalHeroContent() {
  const raw = localStorage.getItem(HERO_STORAGE_KEY);
  if (!raw) return { ...defaultHeroContent };

  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultHeroContent,
      ...parsed,
      focus_items: Array.isArray(parsed?.focus_items) ? parsed.focus_items : defaultHeroContent.focus_items
    };
  } catch {
    return { ...defaultHeroContent };
  }
}

function saveLocalHeroContent(content) {
  const safeContent = {
    ...defaultHeroContent,
    ...content,
    focus_items: Array.isArray(content?.focus_items) ? content.focus_items : defaultHeroContent.focus_items
  };
  localStorage.setItem(HERO_STORAGE_KEY, JSON.stringify(safeContent));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setAuthStatus(message, isError = false) {
  const authStatus = document.getElementById("authStatus");
  if (!authStatus) return;
  authStatus.hidden = false;
  authStatus.textContent = message;
  authStatus.style.color = isError ? "#ff9e9e" : "var(--accent-2)";
}

function setContactSaved(message, isError = false) {
  const saved = document.getElementById("contactSaved");
  if (!saved) return;
  saved.hidden = false;
  saved.textContent = message;
  saved.style.color = isError ? "#ff9e9e" : "var(--accent-2)";
}

function setHeroSaved(message, isError = false) {
  const saved = document.getElementById("heroSaved");
  if (!saved) return;
  saved.hidden = false;
  saved.textContent = message;
  saved.style.color = isError ? "#ff9e9e" : "var(--accent-2)";
}

function setAnalyticsStatus(message, isError = false) {
  const status = document.getElementById("supportAnalyticsStatus");
  if (!status) return;
  status.hidden = false;
  status.textContent = message;
  status.style.color = isError ? "#ff9e9e" : "var(--accent-2)";
}

function setEditUI(isEditing, projectName = "") {
  const saveBtn = document.getElementById("saveBtn");
  const cancelEditBtn = document.getElementById("cancelEdit");
  const removeImageBtn = document.getElementById("removeImage");
  const editStatus = document.getElementById("editStatus");

  if (!saveBtn || !cancelEditBtn || !removeImageBtn || !editStatus) return;

  saveBtn.textContent = isEditing ? "Update Project" : "Save Project";
  cancelEditBtn.hidden = !isEditing;
  removeImageBtn.hidden = !isEditing;

  if (!isEditing) {
    editStatus.hidden = true;
    editStatus.textContent = "";
    return;
  }

  editStatus.hidden = false;
  editStatus.textContent = `Editing: ${projectName}`;
}

function setProjectSaveStatus(message, isError = false) {
  const editStatus = document.getElementById("editStatus");
  if (!editStatus) return;
  editStatus.hidden = false;
  editStatus.textContent = message;
  editStatus.style.color = isError ? "#ff9e9e" : "var(--accent-2)";
}

function resetEditState() {
  editingProjectId = null;
  editingProjectImageUrl = "";
  removeImageRequested = false;
  document.getElementById("projectForm")?.reset();
  setEditUI(false);
}

function setAccessState(signedIn) {
  const authCard = document.getElementById("authCard");
  const adminApp = document.getElementById("adminApp");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!authCard || !adminApp || !logoutBtn) return;

  authCard.hidden = signedIn;
  adminApp.hidden = !signedIn;
  logoutBtn.hidden = !signedIn;
}

function extractStoragePathFromUrl(url) {
  if (!url) return "";
  const marker = `/storage/v1/object/public/${storageBucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(url.slice(index + marker.length));
}

async function removeStoredImage(imageUrl) {
  const filePath = extractStoragePathFromUrl(imageUrl);
  if (!filePath || !supabaseClient) return;
  await supabaseClient.storage.from(storageBucket).remove([filePath]);
}

async function uploadImage(file) {
  if (!file || !supabaseClient || !currentUser) return "";
  const safeName = file.name.replace(/\s+/g, "-");
  const filePath = `${currentUser.id}/${Date.now()}-${safeName}`;

  const { error } = await supabaseClient.storage.from(storageBucket).upload(filePath, file, { upsert: false });
  if (error) throw new Error(error.message);

  const { data } = supabaseClient.storage.from(storageBucket).getPublicUrl(filePath);
  return data.publicUrl;
}

function renderAdminProjects() {
  const list = document.getElementById("adminProjectList");
  const empty = document.getElementById("adminEmpty");

  if (!list || !empty) return;

  list.innerHTML = "";
  const normalizedSearch = adminProjectSearchTerm.trim().toLowerCase();
  const visibleProjects = currentProjects.filter((project) => {
    if (!normalizedSearch) return true;
    const searchableText = [
      project.name || "",
      project.category || "",
      project.description || "",
      (project.tags || []).join(" "),
      project.url || ""
    ]
      .join(" ")
      .toLowerCase();
    return searchableText.includes(normalizedSearch);
  });

  if (!visibleProjects.length) {
    empty.textContent = adminProjectSearchTerm ? "No projects match your search." : "No projects added yet.";
    empty.style.display = "block";
    return;
  }

  empty.textContent = "No projects added yet.";
  empty.style.display = "none";

  visibleProjects.forEach((project) => {
    const index = currentProjects.findIndex((item) => item.id === project.id);
    const row = document.createElement("article");
    row.className = "admin-item";
    const imageUrl = project.image_url || "";
    const tagsText = (project.tags || []).map((tag) => `#${tag}`).join(", ");

    row.innerHTML = `
      ${imageUrl ? `<img src="${imageUrl}" alt="${escapeHTML(project.name)}">` : `<div class="project-media"></div>`}
      <div>
        <h3>${escapeHTML(project.name || "")}</h3>
        <p>${escapeHTML(project.category || "")} | ${escapeHTML(project.description || "")}</p>
        ${tagsText ? `<p>${escapeHTML(tagsText)}</p>` : ""}
        <a class="project-link" href="${encodeURI(project.url || "#")}" target="_blank" rel="noopener noreferrer">Open deployment</a>
      </div>
      <div class="admin-item-actions">
        <div class="admin-order-actions">
          <button class="order-btn" data-id="${project.id}" data-direction="up" type="button" ${index === 0 ? "disabled" : ""}>Up</button>
          <button class="order-btn" data-id="${project.id}" data-direction="down" type="button" ${index === currentProjects.length - 1 ? "disabled" : ""}>Down</button>
        </div>
        <button class="edit-btn" data-id="${project.id}" type="button">Edit</button>
        <button class="remove-btn" data-id="${project.id}" type="button">Delete</button>
      </div>
    `;

    list.appendChild(row);
  });
}

async function loadProjects() {
  if (!supabaseClient) {
    const fallback = localStorage.getItem(STORAGE_KEY);
    const projects = fallback ? JSON.parse(fallback) : [];
    currentProjects = projects.map(normalizeProject).sort((a, b) => a.display_order - b.display_order);
    renderAdminProjects();
    return;
  }

  let response = await supabaseClient
    .from(projectsTable)
    .select("id, name, category, url, description, image_url, tags, display_order, created_at")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  supportsProjectExtras = true;

  if (response.error) {
    supportsProjectExtras = false;
    response = await supabaseClient
      .from(projectsTable)
      .select("id, name, category, url, description, image_url, created_at")
      .order("created_at", { ascending: false });
  }

  if (response.error) {
    alert(`Failed to load projects: ${response.error.message}`);
    return;
  }

  currentProjects = (response.data || []).map(normalizeProject).sort((a, b) => a.display_order - b.display_order);
  renderAdminProjects();
}

function fillContactForm(contact) {
  document.getElementById("contactEmail").value = contact.email || "";
  document.getElementById("contactWhatsapp").value = contact.whatsapp || "";
  document.getElementById("contactLinkedin").value = contact.linkedin || "";
  document.getElementById("contactInstagram").value = contact.instagram || "";
  document.getElementById("contactTiktok").value = contact.tiktok || "";
}

async function loadContactDetails() {
  if (!supabaseClient) {
    fillContactForm(getLocalContactDetails());
    return;
  }

  const { data, error } = await supabaseClient
    .from(contactTable)
    .select("id, email, whatsapp, linkedin, instagram, tiktok")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    setContactSaved(`Could not load contact settings: ${error.message}`, true);
    fillContactForm(getLocalContactDetails());
    return;
  }

  const contact = { ...defaultContact, ...(data || {}) };
  saveLocalContactDetails(contact);
  fillContactForm(contact);
}

function fillHeroForm(content) {
  document.getElementById("heroHeadlineInput").value = content.headline || "";
  document.getElementById("heroLeadInput").value = content.lead || "";
  document.getElementById("heroFocusTitleInput").value = content.focus_title || "";
  document.getElementById("heroFocusItemsInput").value = (content.focus_items || []).join("\n");
}

async function loadHeroContent() {
  if (!supabaseClient) {
    fillHeroForm(getLocalHeroContent());
    return;
  }

  const { data, error } = await supabaseClient
    .from(heroTable)
    .select("headline, lead, focus_title, focus_items")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    setHeroSaved(`Could not load hero content: ${error.message}`, true);
    fillHeroForm(getLocalHeroContent());
    return;
  }

  const content = {
    ...defaultHeroContent,
    ...(data || {}),
    focus_items: Array.isArray(data?.focus_items) ? data.focus_items : defaultHeroContent.focus_items
  };
  saveLocalHeroContent(content);
  fillHeroForm(content);
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function monthKey(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function renderSupportAnalytics(records) {
  const count = records.length;
  const total = records.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const average = count ? total / count : 0;

  const monthTotals = {};
  records.forEach((record) => {
    const key = monthKey(record.paid_at || record.created_at);
    if (!key) return;
    monthTotals[key] = (monthTotals[key] || 0) + Number(record.amount || 0);
  });

  let topMonth = "-";
  let topTotal = 0;
  Object.entries(monthTotals).forEach(([month, totalAmount]) => {
    if (totalAmount > topTotal) {
      topTotal = totalAmount;
      topMonth = month;
    }
  });

  const countEl = document.getElementById("supportCount");
  const totalEl = document.getElementById("supportTotal");
  const avgEl = document.getElementById("supportAverage");
  const topMonthEl = document.getElementById("supportTopMonth");

  if (countEl) countEl.textContent = String(count);
  if (totalEl) totalEl.textContent = formatCurrency(total);
  if (avgEl) avgEl.textContent = formatCurrency(average);
  if (topMonthEl) topMonthEl.textContent = topMonth;
}

function formatSupportDate(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function normalizeSupportStatus(status) {
  return String(status || "unknown").trim().toLowerCase();
}

function getVisibleSupportRecords() {
  if (activeSupportStatusFilter === "all") return supportRecords;
  return supportRecords.filter((record) => normalizeSupportStatus(record.status) === activeSupportStatusFilter);
}

function renderSupportRecordsCount(visibleCount, totalCount) {
  const countEl = document.getElementById("supportRecordsCount");
  if (!countEl) return;

  if (activeSupportStatusFilter === "all") {
    countEl.textContent = `${totalCount} record${totalCount === 1 ? "" : "s"}`;
    return;
  }

  countEl.textContent = `${visibleCount} of ${totalCount} record${totalCount === 1 ? "" : "s"}`;
}

function renderSupportTable() {
  const body = document.getElementById("supportTableBody");
  const empty = document.getElementById("supportTableEmpty");
  if (!body || !empty) return;

  const visibleRecords = getVisibleSupportRecords();
  renderSupportRecordsCount(visibleRecords.length, supportRecords.length);
  body.innerHTML = "";

  if (!visibleRecords.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  visibleRecords.forEach((record) => {
    const row = document.createElement("tr");
    const status = normalizeSupportStatus(record.status);
    const statusClass =
      status === "success" ? "is-success" : ["failed", "abandoned", "refunded"].includes(status) ? `is-${status}` : "";

    row.innerHTML = `
      <td>${escapeHTML(formatSupportDate(record.paid_at || record.created_at))}</td>
      <td>${escapeHTML(record.email || "-")}</td>
      <td>${escapeHTML(formatCurrency(record.amount || 0))} ${escapeHTML(record.currency || "GHS")}</td>
      <td><span class="status-pill ${statusClass}">${escapeHTML(status)}</span></td>
      <td>${escapeHTML(record.reference || "-")}</td>
    `;
    body.appendChild(row);
  });
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (!text.includes(",") && !text.includes('"') && !text.includes("\n")) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportSupportCsv() {
  const rows = getVisibleSupportRecords();
  if (!rows.length) {
    setAnalyticsStatus("No support records to export.", true);
    return;
  }

  const header = ["Date", "Email", "Amount", "Currency", "Status", "Reference"];
  const lines = [
    header.join(","),
    ...rows.map((record) =>
      [
        formatSupportDate(record.paid_at || record.created_at),
        record.email || "",
        Number(record.amount || 0),
        record.currency || "GHS",
        normalizeSupportStatus(record.status),
        record.reference || ""
      ]
        .map(escapeCsvValue)
        .join(",")
    )
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "support-records.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleSupportFilterChange(event) {
  activeSupportStatusFilter = String(event.target.value || "all").toLowerCase();
  renderSupportTable();
}

async function loadSupportAnalytics() {
  if (!supabaseClient) {
    supportRecords = [];
    renderSupportAnalytics([]);
    renderSupportTable();
    setAnalyticsStatus("Analytics use Supabase support_records data.", true);
    return;
  }

  const { data, error } = await supabaseClient
    .from(supportTable)
    .select("reference, email, amount, currency, status, paid_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    supportRecords = [];
    renderSupportAnalytics([]);
    renderSupportTable();
    setAnalyticsStatus(`Could not load support analytics: ${error.message}`, true);
    return;
  }

  supportRecords = data || [];
  renderSupportAnalytics(supportRecords.filter((record) => normalizeSupportStatus(record.status) === "success"));
  renderSupportTable();
  setAnalyticsStatus("Support analytics loaded.");
}

function fillProjectForm(project) {
  document.getElementById("name").value = project.name || "";
  document.getElementById("category").value = project.category || "";
  document.getElementById("url").value = project.url || "";
  document.getElementById("description").value = project.description || "";
  document.getElementById("tags").value = (project.tags || []).join(", ");
  document.getElementById("image").value = "";
}

function startEdit(projectId) {
  const project = currentProjects.find((item) => item.id === projectId);
  if (!project) return;

  editingProjectId = project.id;
  editingProjectImageUrl = project.image_url || "";
  removeImageRequested = false;

  fillProjectForm(project);
  setEditUI(true, project.name || "Project");
  document.getElementById("projectForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handleDelete(projectId) {
  const project = currentProjects.find((item) => item.id === projectId);
  if (!project) return;

  if (!confirm("Delete this project?")) return;

  if (!supabaseClient) {
    currentProjects = currentProjects.filter((item) => item.id !== projectId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentProjects));
    renderAdminProjects();
    return;
  }

  const { error } = await supabaseClient.from(projectsTable).delete().eq("id", projectId);
  if (error) {
    alert(`Failed to delete project: ${error.message}`);
    return;
  }

  await removeStoredImage(project.image_url || "");

  if (editingProjectId === projectId) {
    resetEditState();
  }

  await loadProjects();
}

async function persistProjectOrder() {
  if (!supabaseClient) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentProjects));
    return;
  }

  if (!supportsProjectExtras) {
    setProjectSaveStatus("Project order needs the display_order column. Run updated SQL schema.", true);
    return;
  }

  for (const [index, project] of currentProjects.entries()) {
    const { error } = await supabaseClient
      .from(projectsTable)
      .update({ display_order: index })
      .eq("id", project.id);

    if (error) {
      setProjectSaveStatus(`Failed to reorder project: ${error.message}`, true);
      return;
    }
  }

  setProjectSaveStatus("Project order updated.");
}

async function handleMoveProject(projectId, direction) {
  const fromIndex = currentProjects.findIndex((item) => item.id === projectId);
  if (fromIndex === -1) return;

  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= currentProjects.length) return;

  const [moved] = currentProjects.splice(fromIndex, 1);
  currentProjects.splice(toIndex, 0, moved);
  currentProjects = currentProjects.map((project, index) => ({ ...project, display_order: index }));
  renderAdminProjects();
  await persistProjectOrder();
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function handleProjectSubmit(event) {
  event.preventDefault();
  const saveBtn = document.getElementById("saveBtn");

  const name = document.getElementById("name").value.trim();
  const category = document.getElementById("category").value.trim();
  const url = document.getElementById("url").value.trim();
  const description = document.getElementById("description").value.trim();
  const tags = parseTags(document.getElementById("tags").value);
  const imageFile = document.getElementById("image").files?.[0] || null;

  if (!name || !category || !description) {
    setProjectSaveStatus("Name, category and description are required.", true);
    return;
  }

  if (!isValidHttpUrl(url)) {
    setProjectSaveStatus("Provide a valid deployment URL (http or https).", true);
    return;
  }

  if (!supabaseClient) {
    const fallbackProjects = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (editingProjectId) {
      const idx = fallbackProjects.findIndex((item) => item.id === editingProjectId);
      if (idx !== -1) {
        fallbackProjects[idx] = { ...fallbackProjects[idx], name, category, url, description, tags };
      }
    } else {
      fallbackProjects.unshift({
        id: crypto.randomUUID(),
        name,
        category,
        url,
        description,
        tags,
        image_url: "",
        display_order: 0
      });
    }
    currentProjects = fallbackProjects.map(normalizeProject).map((project, index) => ({ ...project, display_order: index }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentProjects));
    resetEditState();
    renderAdminProjects();
    setProjectSaveStatus("Project saved (local mode).");
    return;
  }

  if (!currentUser?.id) {
    setProjectSaveStatus("You are not signed in. Please log in again.", true);
    return;
  }

  if (saveBtn) saveBtn.disabled = true;
  setProjectSaveStatus(editingProjectId ? "Updating project..." : "Saving project...");

  try {
    let imageUrl = editingProjectImageUrl;

    if (removeImageRequested) {
      await removeStoredImage(editingProjectImageUrl);
      imageUrl = "";
    }

    if (imageFile) {
      if (editingProjectImageUrl) {
        await removeStoredImage(editingProjectImageUrl);
      }
      imageUrl = await uploadImage(imageFile);
    }

    const basePayload = { name, category, url, description, image_url: imageUrl };
    const payload = supportsProjectExtras ? { ...basePayload, tags } : basePayload;

    if (editingProjectId) {
      const { error } = await supabaseClient.from(projectsTable).update(payload).eq("id", editingProjectId);
      if (error) throw new Error(error.message);
    } else {
      const insertPayload = {
        user_id: currentUser.id,
        ...payload,
        ...(supportsProjectExtras ? { display_order: currentProjects.length } : {})
      };
      const { error } = await supabaseClient.from(projectsTable).insert([insertPayload]);
      if (error) throw new Error(error.message);
    }

    resetEditState();
    await loadProjects();
    setProjectSaveStatus("Project saved.");
  } catch (error) {
    setProjectSaveStatus(`Failed to save project: ${error.message}`, true);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function handleAdminListClick(event) {
  const orderButton = event.target.closest(".order-btn");
  if (orderButton) {
    handleMoveProject(orderButton.getAttribute("data-id"), orderButton.getAttribute("data-direction"));
    return;
  }

  const editButton = event.target.closest(".edit-btn");
  if (editButton) {
    startEdit(editButton.getAttribute("data-id"));
    return;
  }

  const removeButton = event.target.closest(".remove-btn");
  if (removeButton) {
    handleDelete(removeButton.getAttribute("data-id"));
  }
}

function handleCancelEdit() {
  resetEditState();
}

function handleAdminProjectSearch(event) {
  adminProjectSearchTerm = event.target.value || "";
  renderAdminProjects();
}

function handleAdminProjectSearchKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  renderAdminProjects();
  const firstEditButton = document.querySelector("#adminProjectList .edit-btn");
  firstEditButton?.focus();
}

function handleRemoveImage() {
  if (!editingProjectId) return;
  removeImageRequested = true;
  setProjectSaveStatus("Editing: existing image will be removed on update");
}

async function handleClearAll() {
  if (!confirm("Delete all saved projects?")) return;

  if (!supabaseClient) {
    currentProjects = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    resetEditState();
    renderAdminProjects();
    return;
  }

  if (!currentProjects.length) return;

  const ids = currentProjects.map((item) => item.id);
  const { error } = await supabaseClient.from(projectsTable).delete().in("id", ids);

  if (error) {
    alert(`Failed to clear projects: ${error.message}`);
    return;
  }

  await Promise.all(currentProjects.map((item) => removeStoredImage(item.image_url || "")));

  resetEditState();
  await loadProjects();
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(currentProjects, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "portfolio-projects.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const text = await file.text();

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("File must contain an array of projects.");
    }

    if (!supabaseClient) {
      currentProjects = parsed.map(normalizeProject);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentProjects));
      renderAdminProjects();
      return;
    }

    const rows = parsed.map((project, index) => ({
      user_id: currentUser?.id,
      name: project.name || "",
      category: project.category || "",
      url: project.url || "",
      description: project.description || "",
      image_url: project.image_url || project.image || "",
      ...(supportsProjectExtras ? { tags: parseTags(project.tags || ""), display_order: index } : {})
    }));

    if (rows.length) {
      const { error } = await supabaseClient.from(projectsTable).insert(rows);
      if (error) throw new Error(error.message);
    }

    await loadProjects();
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function handleContactSubmit(event) {
  event.preventDefault();

  const email = document.getElementById("contactEmail").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setContactSaved("Enter a valid email address.", true);
    return;
  }

  const contact = {
    email,
    whatsapp: document.getElementById("contactWhatsapp").value.trim(),
    linkedin: document.getElementById("contactLinkedin").value.trim(),
    instagram: document.getElementById("contactInstagram").value.trim(),
    tiktok: document.getElementById("contactTiktok").value.trim(),
    updated_at: new Date().toISOString()
  };

  if (!supabaseClient) {
    saveLocalContactDetails(contact);
    setContactSaved("Contact details saved (local mode).");
    return;
  }

  const singletonContact = { id: 1, ...contact };
  const { error } = await supabaseClient.from(contactTable).upsert(singletonContact, { onConflict: "id" });

  if (error) {
    saveLocalContactDetails(contact);
    setContactSaved(`Saved locally only. Supabase error: ${error.message}`, true);
    return;
  }

  saveLocalContactDetails(contact);
  setContactSaved("Contact details saved.");
}

async function handleHeroSubmit(event) {
  event.preventDefault();

  const headline = document.getElementById("heroHeadlineInput").value.trim();
  const lead = document.getElementById("heroLeadInput").value.trim();
  const focusTitle = document.getElementById("heroFocusTitleInput").value.trim();
  const focusItems = document
    .getElementById("heroFocusItemsInput")
    .value.split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!headline || !lead || !focusTitle || !focusItems.length) {
    setHeroSaved("All hero fields are required.", true);
    return;
  }

  const heroContent = {
    headline,
    lead,
    focus_title: focusTitle,
    focus_items: focusItems,
    updated_at: new Date().toISOString()
  };

  if (!supabaseClient) {
    saveLocalHeroContent(heroContent);
    setHeroSaved("Hero content saved (local mode).");
    return;
  }

  const { error } = await supabaseClient.from(heroTable).upsert({ id: 1, ...heroContent }, { onConflict: "id" });

  if (error) {
    saveLocalHeroContent(heroContent);
    setHeroSaved(`Saved locally only. Supabase error: ${error.message}`, true);
    return;
  }

  saveLocalHeroContent(heroContent);
  setHeroSaved("Hero content saved.");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) {
    setAuthStatus("Supabase is not configured. Fill supabase-config.js first.", true);
    return;
  }

  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthStatus(`Login failed: ${error.message}`, true);
    return;
  }

  setAuthStatus("Signed in.");
}

async function handleOtpRequest() {
  if (!supabaseClient) {
    setAuthStatus("Supabase is not configured. Fill supabase-config.js first.", true);
    return;
  }

  const email = document.getElementById("authEmail")?.value.trim() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setAuthStatus("Enter a valid email first to receive an OTP link.", true);
    return;
  }

  const emailRedirectTo = `${window.location.origin}/admin.html`;
  const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo } });
  if (error) {
    setAuthStatus(`OTP request failed: ${error.message}`, true);
    return;
  }

  setAuthStatus("OTP sign-in link sent. Check your email.");
}

async function handleLogout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

async function bootstrapAuth() {
  if (!supabaseClient) {
    setAccessState(false);
    setAuthStatus("Supabase not configured. Fill supabase-config.js and sign in.", true);
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  setAccessState(Boolean(currentUser));

  if (currentUser) {
    await Promise.all([loadProjects(), loadContactDetails(), loadSupportAnalytics(), loadHeroContent()]);
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    setAccessState(Boolean(currentUser));

    if (currentUser) {
      await Promise.all([loadProjects(), loadContactDetails(), loadSupportAnalytics(), loadHeroContent()]);
    } else {
      currentProjects = [];
      renderAdminProjects();
      resetEditState();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("projectForm")?.addEventListener("submit", handleProjectSubmit);
  document.getElementById("contactForm")?.addEventListener("submit", handleContactSubmit);
  document.getElementById("heroContentForm")?.addEventListener("submit", handleHeroSubmit);
  document.getElementById("authForm")?.addEventListener("submit", handleAuthSubmit);
  document.getElementById("otpBtn")?.addEventListener("click", handleOtpRequest);
  document.getElementById("adminProjectList")?.addEventListener("click", handleAdminListClick);
  document.getElementById("adminProjectSearch")?.addEventListener("input", handleAdminProjectSearch);
  document.getElementById("adminProjectSearch")?.addEventListener("keydown", handleAdminProjectSearchKeydown);
  document.getElementById("supportStatusFilter")?.addEventListener("change", handleSupportFilterChange);
  document.getElementById("exportSupportsCsvBtn")?.addEventListener("click", exportSupportCsv);
  document.getElementById("cancelEdit")?.addEventListener("click", handleCancelEdit);
  document.getElementById("removeImage")?.addEventListener("click", handleRemoveImage);
  document.getElementById("clearAll")?.addEventListener("click", handleClearAll);
  document.getElementById("exportBtn")?.addEventListener("click", exportJSON);
  document.getElementById("importInput")?.addEventListener("change", importJSON);
  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);

  await bootstrapAuth();
});
