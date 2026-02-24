const STORAGE_KEY = "portfolio_projects_v1";
const CONTACT_STORAGE_KEY = "portfolio_contact_v1";
const HERO_STORAGE_KEY = "portfolio_hero_content_v1";
const DESCRIPTION_PREVIEW_LENGTH = 140;

const defaults = [
  {
    id: "starter-1",
    name: "E-Commerce Performance Suite",
    category: "Fullstack Web App",
    url: "https://example.com",
    description: "A deployed storefront optimized for conversion and lightning-fast page speed.",
    image_url: "",
    tags: ["ecommerce", "performance"],
    display_order: 0
  },
  {
    id: "starter-2",
    name: "Data Insights Dashboard",
    category: "Analytics Platform",
    url: "https://example.com",
    description: "Interactive analytics with real-time visualizations and executive reporting.",
    image_url: "",
    tags: ["analytics", "dashboard"],
    display_order: 1
  }
];

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
const heroTable = window.SUPABASE_HERO_TABLE || "hero_content";
const supabaseReady = Boolean(window.supabase && supabaseUrl && supabaseAnonKey);
const supabaseClient = supabaseReady ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

let activeProjectTag = "all";
let cachedProjects = [];

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

function getLocalHeroContent() {
  const raw = localStorage.getItem(HERO_STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(HERO_STORAGE_KEY, JSON.stringify(defaultHeroContent));
    return defaultHeroContent;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultHeroContent,
      ...parsed,
      focus_items: Array.isArray(parsed?.focus_items) ? parsed.focus_items : defaultHeroContent.focus_items
    };
  } catch {
    return defaultHeroContent;
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

function normalizeProject(project, index = 0) {
  const parsedTags = Array.isArray(project.tags)
    ? project.tags
    : String(project.tags || "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

  return {
    ...project,
    image_url: project.image_url || project.image || "",
    tags: parsedTags,
    display_order: Number.isFinite(Number(project.display_order)) ? Number(project.display_order) : index
  };
}

async function fetchProjects() {
  if (!supabaseClient) {
    return getLocalProjects().map(normalizeProject);
  }

  const columnsWithExtras = "id, name, category, url, description, image_url, tags, display_order, created_at";
  const columnsBasic = "id, name, category, url, description, image_url, created_at";

  let response = await supabaseClient
    .from(projectsTable)
    .select(columnsWithExtras)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (response.error) {
    response = await supabaseClient
      .from(projectsTable)
      .select(columnsBasic)
      .order("created_at", { ascending: false });
  }

  if (response.error) {
    console.error("Failed to load projects from Supabase:", response.error.message);
    return getLocalProjects().map(normalizeProject);
  }

  return (response.data || []).map((project, index) => normalizeProject(project, index));
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

async function fetchHeroContent() {
  if (!supabaseClient) {
    return getLocalHeroContent();
  }

  const { data, error } = await supabaseClient
    .from(heroTable)
    .select("headline, lead, focus_title, focus_items")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load hero content from Supabase:", error.message);
    return getLocalHeroContent();
  }

  const heroContent = {
    ...defaultHeroContent,
    ...(data || {}),
    focus_items: Array.isArray(data?.focus_items) ? data.focus_items : defaultHeroContent.focus_items
  };
  saveLocalHeroContent(heroContent);
  return heroContent;
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

function renderProjectFilters(projects) {
  const container = document.getElementById("projectFilters");
  if (!container) return;

  const tagSet = new Set();
  projects.forEach((project) => {
    (project.tags || []).forEach((tag) => tagSet.add(tag));
  });
  const tags = Array.from(tagSet).sort();

  container.innerHTML = "";
  const allTags = ["all", ...tags];
  allTags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${activeProjectTag === tag ? " is-active" : ""}`;
    button.dataset.tag = tag;
    button.textContent = tag === "all" ? "All" : `#${tag}`;
    container.appendChild(button);
  });
}

function renderProjects(projects) {
  const grid = document.getElementById("projectGrid");
  const emptyState = document.getElementById("emptyState");

  if (!grid || !emptyState) return;

  grid.innerHTML = "";

  const visibleProjects =
    activeProjectTag === "all"
      ? projects
      : projects.filter((project) => (project.tags || []).includes(activeProjectTag));

  if (!visibleProjects.length) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  visibleProjects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card reveal";
    const rawDescription = project.description || "";
    const safeDescription = escapeHTML(rawDescription);
    const hasLongDescription = rawDescription.length > DESCRIPTION_PREVIEW_LENGTH;
    const previewDescription = hasLongDescription
      ? `${escapeHTML(rawDescription.slice(0, DESCRIPTION_PREVIEW_LENGTH).trim())}...`
      : safeDescription;

    const imageUrl = project.image_url || "";
    const image = imageUrl
      ? `<img class="project-media" src="${imageUrl}" alt="${escapeHTML(project.name)} preview" />`
      : `<div class="project-media"></div>`;

    const tagsMarkup = (project.tags || [])
      .map((tag) => `<span class="tag-pill">#${escapeHTML(tag)}</span>`)
      .join("");

    card.innerHTML = `
      ${image}
      <div class="project-content">
        <p class="project-meta">${escapeHTML(project.category || "")}</p>
        <h3 class="project-title">${escapeHTML(project.name || "")}</h3>
        ${tagsMarkup ? `<div class="project-tags">${tagsMarkup}</div>` : ""}
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

function renderHeroContent(content) {
  const headline = document.getElementById("heroHeadline");
  const lead = document.getElementById("heroLead");
  const focusTitle = document.getElementById("heroPanelTitle");
  const focusList = document.getElementById("heroFocusList");

  if (headline) {
    headline.dataset.text = content.headline;
    headline.textContent = content.headline;
  }
  if (lead) lead.textContent = content.lead;
  if (focusTitle) focusTitle.textContent = content.focus_title;
  if (focusList) {
    focusList.innerHTML = "";
    const items = Array.isArray(content.focus_items) ? content.focus_items : [];
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      focusList.appendChild(li);
    });
  }
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

function handleFilterClick(event) {
  const chip = event.target.closest(".filter-chip");
  if (!chip) return;
  activeProjectTag = chip.dataset.tag || "all";
  renderProjectFilters(cachedProjects);
  renderProjects(cachedProjects);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function typeHeroHeadline() {
  const headline = document.getElementById("heroHeadline");
  if (!headline) return;

  const fullText = (headline.dataset.text || headline.textContent || "").trim();
  if (!fullText) return;

  headline.textContent = "";
  let index = 0;
  const typeSpeedMs = 78;
  const eraseSpeedMs = 62;
  const holdAfterTypingMs = 7000;
  const holdAfterErasingMs = 900;

  const eraseNext = () => {
    if (index < 0) {
      setTimeout(typeNext, holdAfterErasingMs);
      return;
    }

    headline.textContent = fullText.slice(0, index);
    index -= 1;
    setTimeout(eraseNext, eraseSpeedMs);
  };

  const typeNext = () => {
    if (index > fullText.length) {
      setTimeout(eraseNext, holdAfterTypingMs);
      return;
    }

    headline.textContent = fullText.slice(0, index);
    index += 1;
    setTimeout(typeNext, typeSpeedMs);
  };

  typeNext();
}

async function initPortfolio() {
  const [projects, contact, heroContent] = await Promise.all([fetchProjects(), fetchContactDetails(), fetchHeroContent()]);
  cachedProjects = projects;
  renderProjectFilters(projects);
  renderProjects(projects);
  renderContactDetails(contact);
  renderHeroContent(heroContent);
  typeHeroHeadline();
}

document.addEventListener("DOMContentLoaded", () => {
  const year = document.getElementById("year");
  const grid = document.getElementById("projectGrid");
  const filters = document.getElementById("projectFilters");
  if (year) year.textContent = new Date().getFullYear();
  grid?.addEventListener("click", toggleDescription);
  filters?.addEventListener("click", handleFilterClick);
  initPortfolio();
});
