const API_URL = "http://localhost:3000/api/v1";

let token = sessionStorage.getItem("token") ?? "";
let currentUser = JSON.parse(sessionStorage.getItem("user") ?? "null");

const loginForm = document.querySelector("#loginForm");
const postForm = document.querySelector("#postForm");
const postsBody = document.querySelector("#postsBody");
const message = document.querySelector("#message");
const sessionText = document.querySelector("#sessionText");
const logoutButton = document.querySelector("#logoutButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const formTitle = document.querySelector("#formTitle");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const postIdInput = document.querySelector("#postIdInput");
const titleInput = document.querySelector("#titleInput");
const categoryInput = document.querySelector("#categoryInput");
const bodyInput = document.querySelector("#bodyInput");
const searchInput = document.querySelector("#searchInput");
const filterCategoryInput = document.querySelector("#filterCategoryInput");
const sortInput = document.querySelector("#sortInput");
const analyticsList = document.querySelector("#analyticsList");

function setMessage(text = "") {
  message.textContent = text;
}

function categoryLabel(category) {
  return { news: "Новини", study: "Навчання", event: "Подія", question: "Питання" }[category] ?? category;
}

function formatKyivDateTime(value) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(normalized).toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });

  if (response.status === 204) return null;
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error.message);
  return payload.data;
}

function renderSession() {
  sessionText.textContent = currentUser
    ? `${currentUser.name} (${currentUser.role === "admin" ? "адмін" : "користувач"})`
    : "Вхід не виконано";
}

function appendText(parent, text, className) {
  const span = document.createElement("span");
  span.textContent = text;
  if (className) span.className = className;
  parent.append(span);
}

function renderPosts(posts) {
  postsBody.replaceChildren();

  for (const post of posts) {
    const row = document.createElement("tr");

    const title = document.createElement("td");
    appendText(title, post.title, "title-cell");
    appendText(title, post.body.slice(0, 90), "body-preview");

    const category = document.createElement("td");
    category.textContent = categoryLabel(post.category);

    const author = document.createElement("td");
    author.textContent = post.authorName;

    const created = document.createElement("td");
    created.textContent = formatKyivDateTime(post.createdAt);

    const comments = document.createElement("td");
    comments.textContent = String(post.commentsCount);

    const actions = document.createElement("td");
    const wrapper = document.createElement("div");
    wrapper.className = "row-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Редагувати";
    edit.dataset.action = "edit";
    edit.dataset.id = String(post.id);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Видалити";
    remove.className = "ghost";
    remove.dataset.action = "delete";
    remove.dataset.id = String(post.id);

    wrapper.append(edit, remove);
    actions.append(wrapper);
    row.append(title, category, author, created, comments, actions);
    postsBody.append(row);
  }
}

async function loadPosts() {
  if (!token) {
    renderPosts([]);
    return;
  }

  const [sortBy, order] = sortInput.value.split(":");
  const params = new URLSearchParams({
    search: searchInput.value.trim(),
    category: filterCategoryInput.value,
    sortBy,
    order
  });

  const posts = await api(`/posts?${params}`);
  renderPosts(posts);
}

async function loadAnalytics() {
  if (!token) {
    analyticsList.replaceChildren();
    return;
  }

  const rows = await api("/posts/analytics/by-category");
  analyticsList.replaceChildren();

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "analytics-item";
    appendText(item, categoryLabel(row.category));
    appendText(item, `${row.postsCount} / ${row.commentsCount}`);
    analyticsList.append(item);
  }
}

function resetForm() {
  postIdInput.value = "";
  postForm.reset();
  formTitle.textContent = "Нове оголошення";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage();

  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: emailInput.value, password: passwordInput.value })
    });
    token = result.token;
    currentUser = result.user;
    sessionStorage.setItem("token", token);
    sessionStorage.setItem("user", JSON.stringify(currentUser));
    passwordInput.value = "";
    renderSession();
    await Promise.all([loadPosts(), loadAnalytics()]);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Помилка входу");
  }
});

logoutButton.addEventListener("click", () => {
  token = "";
  currentUser = null;
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
  renderSession();
  resetForm();
  renderPosts([]);
  analyticsList.replaceChildren();
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage();

  const payload = {
    title: titleInput.value,
    category: categoryInput.value,
    body: bodyInput.value
  };

  try {
    if (postIdInput.value) {
      await api(`/posts/${postIdInput.value}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/posts", { method: "POST", body: JSON.stringify(payload) });
    }
    resetForm();
    await Promise.all([loadPosts(), loadAnalytics()]);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Не вдалося зберегти");
  }
});

postsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  setMessage();

  try {
    if (button.dataset.action === "delete") {
      await api(`/posts/${id}`, { method: "DELETE" });
      await Promise.all([loadPosts(), loadAnalytics()]);
      return;
    }

    const post = await api(`/posts/${id}`);
    postIdInput.value = String(post.id);
    titleInput.value = post.title;
    categoryInput.value = post.category;
    bodyInput.value = post.body;
    formTitle.textContent = "Редагування оголошення";
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Дія недоступна");
  }
});

cancelEditButton.addEventListener("click", resetForm);
searchInput.addEventListener("input", () => void loadPosts().catch((error) => setMessage(error.message)));
filterCategoryInput.addEventListener("change", () => void loadPosts().catch((error) => setMessage(error.message)));
sortInput.addEventListener("change", () => void loadPosts().catch((error) => setMessage(error.message)));

renderSession();
if (token) {
  void Promise.all([loadPosts(), loadAnalytics()]).catch((error) => setMessage(error.message));
} else {
  renderPosts([]);
  analyticsList.replaceChildren();
}



