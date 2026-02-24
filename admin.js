const CONTACT_STORAGE_KEY = "portfolio_contact_v1";
const STORAGE_KEY = "portfolio_projects_v1";

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
const storageBucket = window.SUPABASE_STORAGE_BUCKET || "project-images";
const supabaseReady = Boolean(window.supabase && supabaseUrl && supabaseAnonKey);
const supabaseClient = supabaseReady ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

let editingProjectId = null;
let editingProjectImageUrl = "";
let removeImageRequested = false;
let currentProjects = [];
let currentUser = null;

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

  if (!currentProjects.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  currentProjects.forEach((project) => {
    const row = document.createElement("article");
    row.className = "admin-item";
    const imageUrl = project.image_url || "";

    row.innerHTML = `
      ${imageUrl ? `<img src="${imageUrl}" alt="${escapeHTML(project.name)}">` : `<div class="project-media"></div>`}
      <div>
        <h3>${escapeHTML(project.name || "")}</h3>
        <p>${escapeHTML(project.category || "")} | ${escapeHTML(project.description || "")}</p>
        <a class="project-link" href="${encodeURI(project.url || "#")}" target="_blank" rel="noopener noreferrer">Open deployment</a>
      </div>
      <div class="admin-item-actions">
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
    currentProjects = fallback ? JSON.parse(fallback) : [];
    renderAdminProjects();
    return;
  }

  const { data, error } = await supabaseClient
    .from(projectsTable)
    .select("id, name, category, url, description, image_url, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    alert(`Failed to load projects: ${error.message}`);
    return;
  }

  currentProjects = data || [];
  renderAdminProjects();
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

function fillContactForm(contact) {
  document.getElementById("contactEmail").value = contact.email || "";
  document.getElementById("contactWhatsapp").value = contact.whatsapp || "";
  document.getElementById("contactLinkedin").value = contact.linkedin || "";
  document.getElementById("contactInstagram").value = contact.instagram || "";
  document.getElementById("contactTiktok").value = contact.tiktok || "";
}

function fillProjectForm(project) {
  document.getElementById("name").value = project.name || "";
  document.getElementById("category").value = project.category || "";
  document.getElementById("url").value = project.url || "";
  document.getElementById("description").value = project.description || "";
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

async function handleProjectSubmit(event) {
  event.preventDefault();
  const saveBtn = document.getElementById("saveBtn");

  const name = document.getElementById("name").value.trim();
  const category = document.getElementById("category").value.trim();
  const url = document.getElementById("url").value.trim();
  const description = document.getElementById("description").value.trim();
  const imageFile = document.getElementById("image").files?.[0] || null;

  if (!supabaseClient) {
    const fallbackProjects = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (editingProjectId) {
      const idx = fallbackProjects.findIndex((item) => item.id === editingProjectId);
      if (idx !== -1) {
        fallbackProjects[idx] = { ...fallbackProjects[idx], name, category, url, description };
      }
    } else {
      fallbackProjects.unshift({ id: crypto.randomUUID(), name, category, url, description, image_url: "" });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackProjects));
    resetEditState();
    currentProjects = fallbackProjects;
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

    if (editingProjectId) {
      const { error } = await supabaseClient
        .from(projectsTable)
        .update({ name, category, url, description, image_url: imageUrl })
        .eq("id", editingProjectId);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseClient
        .from(projectsTable)
        .insert([{ user_id: currentUser.id, name, category, url, description, image_url: imageUrl }]);

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

function handleRemoveImage() {
  if (!editingProjectId) return;
  removeImageRequested = true;
  const status = document.getElementById("editStatus");
  if (status) {
    status.hidden = false;
    status.textContent = "Editing: existing image will be removed on update";
  }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      currentProjects = parsed;
      renderAdminProjects();
      return;
    }

    const rows = parsed.map((project) => ({
      name: project.name || "",
      category: project.category || "",
      url: project.url || "",
      description: project.description || "",
      image_url: project.image_url || project.image || ""
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

  const contact = {
    email: document.getElementById("contactEmail").value.trim(),
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
    await Promise.all([loadProjects(), loadContactDetails()]);
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    setAccessState(Boolean(currentUser));

    if (currentUser) {
      await Promise.all([loadProjects(), loadContactDetails()]);
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
  document.getElementById("authForm")?.addEventListener("submit", handleAuthSubmit);
  document.getElementById("adminProjectList")?.addEventListener("click", handleAdminListClick);
  document.getElementById("cancelEdit")?.addEventListener("click", handleCancelEdit);
  document.getElementById("removeImage")?.addEventListener("click", handleRemoveImage);
  document.getElementById("clearAll")?.addEventListener("click", handleClearAll);
  document.getElementById("exportBtn")?.addEventListener("click", exportJSON);
  document.getElementById("importInput")?.addEventListener("change", importJSON);
  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);

  await bootstrapAuth();
});
