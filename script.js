const STORAGE_KEY = "portfolio_projects_v1";
const CONTACT_STORAGE_KEY = "portfolio_contact_v1";
const DESCRIPTION_PREVIEW_LENGTH = 140;

const defaults = [
  {
    id: "starter-1",
    name: "E-Commerce Performance Suite",
    category: "Fullstack Web App",
    url: "https://example.com",
    description: "A deployed storefront optimized for conversion and lightning-fast page speed.",
    image_url: ""
  },
  {
    id: "starter-2",
    name: "Data Insights Dashboard",
    category: "Analytics Platform",
    url: "https://example.com",
    description: "Interactive analytics with real-time visualizations and executive reporting.",
    image_url: ""
  }
];

const defaultContact = {
  email: "opokuamanorsolomon@gmail.com",
  whatsapp: "",
  linkedin: "",
  instagram: "",
  tiktok: ""
};

const supabaseUrl = window.SUPABASE_URL || "";
const supabaseAnonKey = window.SUPABASE_ANON_KEY || "";
const projectsTable = window.SUPABASE_PROJECTS_TABLE || "projects";
const contactTable = window.SUPABASE_CONTACT_TABLE || "contact_settings";
const supabaseReady = Boolean(window.supabase && supabaseUrl && supabaseAnonKey);
const supabaseClient = supabaseReady ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

function getLocalProjects() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaults;
  } catch {
    return defaults;
  }
}

function getLocalContactDetails() {
  const raw = localStorage.getItem(CONTACT_STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(defaultContact));
    return defaultContact;
  }

  try {
    const parsed = JSON.parse(raw);
    return { ...defaultContact, ...parsed };
  } catch {
    return defaultContact;
  }
}

function saveLocalContactDetails(contact) {
  const safeContact = { ...defaultContact, ...contact };
  localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(safeContact));
}

async function fetchProjects() {
  if (!supabaseClient) {
    return getLocalProjects();
  }

  const { data, error } = await supabaseClient
    .from(projectsTable)
    .select("id, name, category, url, description, image_url, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load projects from Supabase:", error.message);
    return getLocalProjects();
  }

  return (data || []).map((project) => ({
    ...project,
    image_url: project.image_url || ""
  }));
}

async function fetchContactDetails() {
  if (!supabaseClient) {
    return getLocalContactDetails();
  }

  const { data, error } = await supabaseClient
    .from(contactTable)
    .select("email, whatsapp, linkedin, instagram, tiktok")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load contact details from Supabase:", error.message);
    return getLocalContactDetails();
  }

  const contact = { ...defaultContact, ...(data || {}) };
  saveLocalContactDetails(contact);
  return contact;
}

function normalizeWhatsAppLink(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

function applySocialLink(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  if (!value) {
    element.href = "#";
    element.classList.add("is-disabled");
    element.setAttribute("aria-disabled", "true");
    return;
  }

  element.href = value;
  element.classList.remove("is-disabled");
  element.removeAttribute("aria-disabled");
}

function renderProjects(projects) {
  const grid = document.getElementById("projectGrid");
  const emptyState = document.getElementById("emptyState");

  if (!grid || !emptyState) return;

  grid.innerHTML = "";

  if (!projects.length) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  projects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card reveal";
    const rawDescription = project.description || "";
    const safeDescription = escapeHTML(rawDescription);
    const hasLongDescription = rawDescription.length > DESCRIPTION_PREVIEW_LENGTH;
    const previewDescription = hasLongDescription
      ? `${escapeHTML(rawDescription.slice(0, DESCRIPTION_PREVIEW_LENGTH).trim())}...`
      : safeDescription;

    const imageUrl = project.image_url || project.image || "";
    const image = imageUrl
      ? `<img class="project-media" src="${imageUrl}" alt="${escapeHTML(project.name)} preview" />`
      : `<div class="project-media"></div>`;

    card.innerHTML = `
      ${image}
      <div class="project-content">
        <p class="project-meta">${escapeHTML(project.category || "")}</p>
        <h3 class="project-title">${escapeHTML(project.name || "")}</h3>
        <p class="project-description" data-full="${safeDescription}" data-preview="${previewDescription}" data-expanded="false">${previewDescription}</p>
        ${hasLongDescription ? '<button class="toggle-description" type="button">View more</button>' : ""}
        <a class="project-link" href="${encodeURI(project.url || "#")}" target="_blank" rel="noopener noreferrer">Visit Deployment</a>
      </div>
    `;

    grid.appendChild(card);
  });
}

function renderContactDetails(contact) {
  const emailBtn = document.getElementById("contactEmailBtn");

  if (emailBtn) {
    emailBtn.href = `mailto:${contact.email}`;
  }

  applySocialLink("whatsappLink", normalizeWhatsAppLink(contact.whatsapp || ""));
  applySocialLink("linkedinLink", (contact.linkedin || "").trim());
  applySocialLink("instagramLink", (contact.instagram || "").trim());
  applySocialLink("tiktokLink", (contact.tiktok || "").trim());
}

function toggleDescription(event) {
  const button = event.target.closest(".toggle-description");
  if (!button) return;

  const content = button.closest(".project-content");
  const description = content?.querySelector(".project-description");
  if (!description) return;

  const isExpanded = description.dataset.expanded === "true";
  description.textContent = isExpanded ? description.dataset.preview : description.dataset.full;
  description.dataset.expanded = isExpanded ? "false" : "true";
  button.textContent = isExpanded ? "View more" : "View less";
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function initPortfolio() {
  const [projects, contact] = await Promise.all([fetchProjects(), fetchContactDetails()]);
  renderProjects(projects);
  renderContactDetails(contact);
}

document.addEventListener("DOMContentLoaded", () => {
  const year = document.getElementById("year");
  const grid = document.getElementById("projectGrid");
  if (year) year.textContent = new Date().getFullYear();
  grid?.addEventListener("click", toggleDescription);
  initPortfolio();
});
