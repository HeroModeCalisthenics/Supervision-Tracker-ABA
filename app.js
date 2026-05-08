const STORAGE_KEY = "fieldwork-flow-state-v1";
const CLOUD_PROFILE_DEFAULTS = {
  weeklyGoal: 20,
  unrestrictedTarget: 60,
  supervisionTarget: 5,
  defaultSetting: "Clinic"
};

const activityTypes = [
  { name: "Direct Therapy", category: "Restricted", experience: "Independent", clientPresent: true, badge: "Restricted", prompt: "Implemented acquisition targets and behavior support plan." },
  { name: "Supervision Meeting", category: "Unrestricted", experience: "Supervised", clientPresent: false, badge: "Supervised", prompt: "Discussed cases, feedback, competencies, and next steps." },
  { name: "Graphing Data", category: "Unrestricted", experience: "Independent", clientPresent: false, badge: "Unrestricted", prompt: "Graphed session data and reviewed trends." },
  { name: "Data Analysis", category: "Unrestricted", experience: "Independent", clientPresent: false, badge: "Unrestricted", prompt: "Analyzed data and considered program changes." },
  { name: "Program Writing / Revision", category: "Unrestricted", experience: "Independent", clientPresent: false, badge: "Unrestricted", prompt: "Wrote or revised treatment goals, procedures, or materials." },
  { name: "Assessment", category: "Unrestricted", experience: "Independent", clientPresent: true, badge: "Unrestricted", prompt: "Completed assessment observation, measurement, or scoring." },
  { name: "Training", category: "Unrestricted", experience: "Independent", clientPresent: false, badge: "Unrestricted", prompt: "Provided caregiver or staff training." },
  { name: "Supervisor Observation During Direct Therapy", category: "Restricted", experience: "Supervised", clientPresent: true, badge: "Supervised", prompt: "Supervisor observed direct implementation with client present." },
  { name: "Baseline Observation / Measurement Design", category: "Unrestricted", experience: "Independent", clientPresent: true, badge: "Unrestricted", prompt: "Designed measurement system or completed baseline observation." },
  { name: "Literature Review", category: "Unrestricted", experience: "Independent", clientPresent: false, badge: "Unrestricted", prompt: "Reviewed behavior-analytic literature related to programming." },
  { name: "Other", category: "", experience: "", clientPresent: false, badge: "Review", prompt: "Describe the activity and classify it manually." }
];

const state = loadState();
let selectedActivity = activityTypes[0].name;
let cloud = {
  client: null,
  user: null,
  enabled: false,
  loading: false
};

const $ = (id) => document.getElementById(id);

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return {
    profile: {
      name: "",
      email: "",
      weeklyGoal: 20,
      unrestrictedTarget: 60,
      supervisionTarget: 5,
      defaultSetting: "Clinic"
    },
    supervisors: [
      { id: crypto.randomUUID(), name: "Default Supervisor", credential: "BCBA", email: "", organization: "", active: true }
    ],
    entries: []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cloudConfig() {
  return window.FIELDWORK_FLOW_CONFIG || {};
}

function configureSupabase() {
  const config = cloudConfig();
  if (!window.supabase || !config.supabaseUrl || !config.supabaseAnonKey) {
    updateAuthUi();
    return;
  }
  cloud.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  cloud.enabled = true;
}

async function initSupabase() {
  configureSupabase();
  if (!cloud.enabled) return;
  const { data, error } = await cloud.client.auth.getSession();
  if (error) {
    setAuthStatus(`Auth error: ${error.message}`);
    return;
  }
  cloud.user = data.session?.user || null;
  updateAuthUi();
  if (cloud.user) await loadCloudState();
  cloud.client.auth.onAuthStateChange(async (_event, session) => {
    cloud.user = session?.user || null;
    updateAuthUi();
    if (cloud.user) await loadCloudState();
  });
}

function setAuthStatus(message) {
  $("authStatus").textContent = message;
}

function updateAuthUi() {
  const signedIn = !!cloud.user;
  $("authForm").classList.toggle("hidden", signedIn);
  $("signOutBtn").classList.toggle("hidden", !signedIn);
  if (!cloud.enabled) {
    setAuthStatus("Local only");
  } else if (signedIn) {
    setAuthStatus(`Cloud sync: ${cloud.user.email}`);
  } else {
    setAuthStatus("Sign in for cloud sync");
  }
}

async function signIn() {
  if (!cloud.enabled) return alert("Supabase is not configured.");
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) return alert("Enter email and password.");
  const { error } = await cloud.client.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
}

async function signUp() {
  if (!cloud.enabled) return alert("Supabase is not configured.");
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) return alert("Enter email and password.");
  const { error } = await cloud.client.auth.signUp({ email, password });
  if (error) {
    alert(error.message);
  } else {
    alert("Account created. If Supabase asks for email confirmation, confirm it, then sign in.");
  }
}

async function signOut() {
  if (!cloud.enabled) return;
  await cloud.client.auth.signOut();
  cloud.user = null;
  updateAuthUi();
}

async function loadCloudState() {
  if (!cloud.user || cloud.loading) return;
  cloud.loading = true;
  setAuthStatus("Loading cloud data...");
  try {
    const [profileResult, settingsResult, supervisorsResult, entriesResult] = await Promise.all([
      cloud.client.from("profiles").select("*").eq("id", cloud.user.id).maybeSingle(),
      cloud.client.from("settings").select("*").eq("user_id", cloud.user.id).maybeSingle(),
      cloud.client.from("supervisors").select("*").order("created_at", { ascending: true }),
      cloud.client.from("fieldwork_entries").select("*").order("date", { ascending: false }).order("start_time", { ascending: false })
    ]);
    throwIfSupabaseError(profileResult.error);
    throwIfSupabaseError(settingsResult.error);
    throwIfSupabaseError(supervisorsResult.error);
    throwIfSupabaseError(entriesResult.error);

    const profile = profileResult.data;
    const settings = settingsResult.data;
    state.profile = {
      name: profile?.name || "",
      email: profile?.email || cloud.user.email || "",
      weeklyGoal: Number(settings?.weekly_hour_goal ?? CLOUD_PROFILE_DEFAULTS.weeklyGoal),
      unrestrictedTarget: Number(settings?.unrestricted_target_percentage ?? CLOUD_PROFILE_DEFAULTS.unrestrictedTarget),
      supervisionTarget: Number(settings?.supervision_target_percentage ?? CLOUD_PROFILE_DEFAULTS.supervisionTarget),
      defaultSetting: settings?.default_setting || CLOUD_PROFILE_DEFAULTS.defaultSetting
    };
    state.supervisors = supervisorsResult.data.map(fromCloudSupervisor);
    state.entries = entriesResult.data.map(fromCloudEntry);
    await ensureCloudProfile();
    if (!state.supervisors.length) {
      await createDefaultCloudSupervisor();
    }
    saveState();
    renderAll();
    updateAuthUi();
  } catch (error) {
    setAuthStatus(`Sync error: ${error.message}`);
  } finally {
    cloud.loading = false;
  }
}

function throwIfSupabaseError(error) {
  if (error) throw error;
}

async function ensureCloudProfile() {
  if (!cloud.user) return;
  const profilePayload = {
    id: cloud.user.id,
    email: state.profile.email || cloud.user.email || "",
    name: state.profile.name || ""
  };
  const settingsPayload = {
    user_id: cloud.user.id,
    weekly_hour_goal: Number(state.profile.weeklyGoal || CLOUD_PROFILE_DEFAULTS.weeklyGoal),
    unrestricted_target_percentage: Number(state.profile.unrestrictedTarget || CLOUD_PROFILE_DEFAULTS.unrestrictedTarget),
    supervision_target_percentage: Number(state.profile.supervisionTarget || CLOUD_PROFILE_DEFAULTS.supervisionTarget),
    default_setting: state.profile.defaultSetting || CLOUD_PROFILE_DEFAULTS.defaultSetting
  };
  const profileResult = await cloud.client.from("profiles").upsert(profilePayload);
  throwIfSupabaseError(profileResult.error);
  const settingsResult = await cloud.client.from("settings").upsert(settingsPayload, { onConflict: "user_id" });
  throwIfSupabaseError(settingsResult.error);
}

async function createDefaultCloudSupervisor() {
  const fallback = { id: crypto.randomUUID(), name: "Default Supervisor", credential: "BCBA", email: "", organization: "", active: true };
  const saved = await saveCloudSupervisor(fallback);
  state.supervisors = [saved || fallback];
  saveState();
  renderAll();
}

async function saveCloudEntry(entry) {
  if (!cloud.user) return;
  const result = await cloud.client.from("fieldwork_entries").upsert(toCloudEntry(entry));
  throwIfSupabaseError(result.error);
}

async function saveCloudSupervisor(supervisor) {
  if (!cloud.user) return null;
  const result = await cloud.client.from("supervisors").upsert(toCloudSupervisor(supervisor)).select("*").single();
  throwIfSupabaseError(result.error);
  return fromCloudSupervisor(result.data);
}

async function deleteCloudSupervisor(id) {
  if (!cloud.user) return;
  const result = await cloud.client.from("supervisors").delete().eq("id", id);
  throwIfSupabaseError(result.error);
}

async function deleteCloudEntry(id) {
  if (!cloud.user) return;
  const result = await cloud.client.from("fieldwork_entries").delete().eq("id", id);
  throwIfSupabaseError(result.error);
}

async function saveCloudSettings() {
  if (!cloud.user) return;
  await ensureCloudProfile();
}

function toCloudEntry(entry) {
  return {
    id: entry.id,
    user_id: cloud.user.id,
    date: entry.date,
    start_time: entry.startTime,
    end_time: entry.endTime,
    duration_hours: entry.durationHours,
    activity_type: entry.activityType,
    activity_category: entry.activityCategory,
    experience_type: entry.experienceType,
    supervision_type: entry.supervisionType,
    supervision_method: entry.supervisionMethod,
    supervision_start_time: entry.supervisionStartTime || null,
    supervision_end_time: entry.supervisionEndTime || null,
    supervised_hours: entry.supervisedHours ?? (entry.experienceType === "Supervised" ? entry.durationHours : 0),
    individual_supervision_hours: entry.individualSupervisionHours ?? (entry.experienceType === "Supervised" && entry.supervisionType === "Individual" ? entry.durationHours : 0),
    group_supervision_hours: entry.groupSupervisionHours ?? (entry.experienceType === "Supervised" && entry.supervisionType === "Group" ? entry.durationHours : 0),
    supervisor_id: entry.supervisorId || null,
    client_present: entry.clientPresent,
    supervisor_client_observation: entry.supervisorClientObservation,
    setting: entry.setting,
    notes: entry.notes,
    manual_override: entry.manualOverride,
    override_reason: entry.overrideReason,
    parent_session_id: entry.parentSessionId || null
  };
}

function fromCloudEntry(row) {
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    durationHours: Number(row.duration_hours || 0),
    activityType: row.activity_type,
    activityCategory: row.activity_category,
    experienceType: row.experience_type,
    supervisionType: row.supervision_type,
    supervisionMethod: row.supervision_method,
    supervisionStartTime: row.supervision_start_time ? row.supervision_start_time.slice(0, 5) : "",
    supervisionEndTime: row.supervision_end_time ? row.supervision_end_time.slice(0, 5) : "",
    supervisedHours: Number(row.supervised_hours ?? (row.experience_type === "Supervised" ? row.duration_hours : 0)),
    individualSupervisionHours: Number(row.individual_supervision_hours ?? (row.experience_type === "Supervised" && row.supervision_type === "Individual" ? row.duration_hours : 0)),
    groupSupervisionHours: Number(row.group_supervision_hours ?? (row.experience_type === "Supervised" && row.supervision_type === "Group" ? row.duration_hours : 0)),
    supervisorId: row.supervisor_id || "",
    clientPresent: row.client_present,
    supervisorClientObservation: row.supervisor_client_observation,
    setting: row.setting || "",
    notes: row.notes || "",
    manualOverride: row.manual_override,
    overrideReason: row.override_reason || "",
    parentSessionId: row.parent_session_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toCloudSupervisor(supervisor) {
  return {
    id: supervisor.id,
    user_id: cloud.user.id,
    supervisor_name: supervisor.name,
    credential: supervisor.credential,
    email: supervisor.email,
    organization: supervisor.organization,
    active_status: supervisor.active
  };
}

function fromCloudSupervisor(row) {
  return {
    id: row.id,
    name: row.supervisor_name,
    credential: row.credential || "",
    email: row.email || "",
    organization: row.organization || "",
    active: row.active_status
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(date) {
  return date.slice(0, 7);
}

function currentMonth() {
  return todayIso().slice(0, 7);
}

function getActivity(name = selectedActivity) {
  return activityTypes.find((item) => item.name === name) || activityTypes.at(-1);
}

function decimalHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

function formatHours(value) {
  return (Number(value) || 0).toFixed(2);
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function renderActivityButtons() {
  $("activityGrid").innerHTML = activityTypes.map((activity) => {
    const badgeClass = badgeClassFor(activity.badge);
    return `<button type="button" class="activity-card ${activity.name === selectedActivity ? "active" : ""}" data-activity="${escapeAttr(activity.name)}">
      <strong>${activity.name}</strong>
      <span class="${badgeClass}">${activity.badge}</span>
    </button>`;
  }).join("");
}

function badgeClassFor(value) {
  const normalized = String(value).toLowerCase();
  if (normalized.includes("restricted") && !normalized.includes("unrestricted")) return "restricted";
  if (normalized.includes("unrestricted")) return "unrestricted";
  if (normalized.includes("supervised")) return "supervised";
  return "other";
}

function renderClassification() {
  const activity = getActivity();
  const supervisorPresent = $("supervisorPresent").checked || activity.experience === "Supervised";
  const category = $("manualOverride").checked ? $("activityCategory").value : activity.category || "Needs review";
  const experience = $("manualOverride").checked ? $("experienceType").value : supervisorPresent ? "Supervised" : activity.experience || "Needs review";
  const client = $("clientPresent").checked ? "Client present" : "No client";
  const fieldworkHours = decimalHours($("startTime").value, $("endTime").value);
  const supervisedHours = supervisorPresent ? currentSupervisedHours() : 0;
  $("classificationPanel").innerHTML = `
    <span class="pill ${badgeClassFor(category)}">${category}</span>
    <span class="pill ${badgeClassFor(experience)}">${experience}</span>
    <span class="pill other">${client}</span>
    <span class="pill other">${formatHours(fieldworkHours)} hours</span>
    ${supervisorPresent ? `<span class="pill supervised">${formatHours(supervisedHours)} supervised</span>` : ""}
  `;
}

function syncConditionalFields() {
  const supervised = $("supervisorPresent").checked || getActivity().experience === "Supervised" || ($("manualOverride").checked && $("experienceType").value === "Supervised");
  $("supervisionFields").classList.toggle("visible", supervised);
  $("overrideFields").classList.toggle("visible", $("manualOverride").checked || getActivity().name === "Other");
  if (getActivity().name === "Other") $("manualOverride").checked = true;
  syncSupervisionTimeFields();
  renderClassification();
}

function syncSupervisionTimeFields() {
  const sameTime = $("supervisionSameTime").checked;
  document.querySelectorAll(".supervision-time-field").forEach((field) => field.classList.toggle("hidden", sameTime));
  if (sameTime) {
    $("supervisionStartTime").value = $("startTime").value;
    $("supervisionEndTime").value = $("endTime").value;
  }
}

function currentSupervisedHours() {
  const sameTime = $("supervisionSameTime").checked;
  const start = sameTime ? $("startTime").value : $("supervisionStartTime").value;
  const end = sameTime ? $("endTime").value : $("supervisionEndTime").value;
  return decimalHours(start, end);
}

function hydrateFormDefaults() {
  $("date").value = todayIso();
  $("startTime").value = "09:00";
  $("endTime").value = "10:00";
  $("setting").value = state.profile.defaultSetting || "";
  $("dashboardMonth").value = currentMonth();
  $("splitDate").value = todayIso();
  $("splitStart").value = "12:00";
  $("splitEnd").value = "14:30";
  applyActivityDefaults();
}

function applyActivityDefaults() {
  const activity = getActivity();
  $("clientPresent").checked = !!activity.clientPresent;
  $("supervisorPresent").checked = activity.experience === "Supervised";
  $("notes").placeholder = activity.prompt;
  if (activity.category) $("activityCategory").value = activity.category;
  if (activity.experience) $("experienceType").value = activity.experience;
  syncConditionalFields();
}

function supervisorName(id) {
  return state.supervisors.find((sup) => sup.id === id)?.name || "";
}

function renderSupervisorSelects() {
  const options = state.supervisors.map((sup) => `<option value="${sup.id}">${escapeHtml(sup.name)}${sup.credential ? `, ${escapeHtml(sup.credential)}` : ""}</option>`).join("");
  const allOption = `<option value="">All</option>`;
  $("supervisorId").innerHTML = options || `<option value="">Add a supervisor first</option>`;
  $("filterSupervisor").innerHTML = allOption + options;
}

function collectEntry() {
  const activity = getActivity();
  const manual = $("manualOverride").checked || activity.name === "Other";
  const supervised = $("supervisorPresent").checked || activity.experience === "Supervised" || (manual && $("experienceType").value === "Supervised");
  const durationHours = decimalHours($("startTime").value, $("endTime").value);
  const supervisedHours = supervised ? Math.min(currentSupervisedHours(), durationHours) : 0;
  const individualSupervisionHours = supervised && $("supervisionType").value === "Individual" ? supervisedHours : 0;
  const groupSupervisionHours = supervised && $("supervisionType").value === "Group" ? supervisedHours : 0;
  return {
    id: $("editingId").value || crypto.randomUUID(),
    date: $("date").value,
    startTime: $("startTime").value,
    endTime: $("endTime").value,
    durationHours,
    activityType: activity.name,
    activityCategory: manual ? $("activityCategory").value : activity.category || "Restricted",
    experienceType: supervised ? "Supervised" : (manual ? $("experienceType").value : activity.experience || "Independent"),
    supervisionType: supervised ? $("supervisionType").value : "None",
    supervisionMethod: supervised ? $("supervisionMethod").value : "None",
    supervisionStartTime: supervised ? ($("supervisionSameTime").checked ? $("startTime").value : $("supervisionStartTime").value) : "",
    supervisionEndTime: supervised ? ($("supervisionSameTime").checked ? $("endTime").value : $("supervisionEndTime").value) : "",
    supervisedHours,
    individualSupervisionHours,
    groupSupervisionHours,
    supervisorId: supervised ? $("supervisorId").value : "",
    clientPresent: $("clientPresent").checked,
    supervisorClientObservation: supervised ? $("supervisorClientObservation").checked : false,
    setting: $("setting").value.trim(),
    notes: $("notes").value.trim(),
    manualOverride: manual,
    overrideReason: manual ? $("overrideReason").value.trim() : "",
    parentSessionId: "",
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
}

async function upsertEntry(entry) {
  const index = state.entries.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    entry.createdAt = state.entries[index].createdAt;
    state.entries[index] = entry;
  } else {
    state.entries.push(entry);
  }
  state.entries.sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  saveState();
  renderAll();
  if (cloud.user) {
    try {
      await saveCloudEntry(entry);
      updateAuthUi();
    } catch (error) {
      setAuthStatus(`Save error: ${error.message}`);
    }
  }
}

function renderAll() {
  renderSupervisorSelects();
  renderActivityButtons();
  renderHome();
  renderRecentEntries();
  renderDashboard();
  renderEntriesTable();
  renderSettings();
  renderSupervisors();
  renderClassification();
}

function entriesForMonth(key = $("dashboardMonth").value || currentMonth()) {
  return state.entries.filter((entry) => monthKey(entry.date) === key);
}

function totals(entries) {
  const sum = (filter) => entries.filter(filter).reduce((acc, entry) => acc + Number(entry.durationHours || 0), 0);
  const sumValue = (selector) => entries.reduce((acc, entry) => acc + Number(selector(entry) || 0), 0);
  const total = sum(() => true);
  return {
    total,
    independent: Math.max(total - sumValue((entry) => entry.supervisedHours ?? (entry.experienceType === "Supervised" ? entry.durationHours : 0)), 0),
    supervised: sumValue((entry) => entry.supervisedHours ?? (entry.experienceType === "Supervised" ? entry.durationHours : 0)),
    restricted: sum((entry) => entry.activityCategory === "Restricted"),
    unrestricted: sum((entry) => entry.activityCategory === "Unrestricted"),
    individualSupervision: sumValue((entry) => entry.individualSupervisionHours ?? (entry.experienceType === "Supervised" && entry.supervisionType === "Individual" ? entry.durationHours : 0)),
    groupSupervision: sumValue((entry) => entry.groupSupervisionHours ?? (entry.experienceType === "Supervised" && entry.supervisionType === "Group" ? entry.durationHours : 0)),
    contacts: entries.filter((entry) => Number(entry.supervisedHours ?? (entry.experienceType === "Supervised" ? entry.durationHours : 0)) > 0).length,
    observations: entries.filter((entry) => entry.supervisorClientObservation).length
  };
}

function evaluatePath(entries, type) {
  const t = totals(entries);
  const isConcentrated = type === "concentrated";
  const requiredPct = isConcentrated ? 10 : 5;
  const requiredContacts = isConcentrated ? 6 : 4;
  const requiredSupervised = Math.round((t.total * requiredPct / 100) * 100) / 100;
  const supervisionPct = percent(t.supervised, t.total);
  const checks = [
    {
      key: "hours",
      label: "Monthly hours",
      met: t.total >= 20 && t.total <= 130,
      need: t.total < 20 ? `${formatHours(20 - t.total)} more total hours` : t.total > 130 ? "monthly hours are over 130" : ""
    },
    {
      key: "supervision",
      label: "Supervision",
      met: t.total > 0 && t.supervised >= requiredSupervised,
      need: t.total ? `${formatHours(Math.max(requiredSupervised - t.supervised, 0))} more supervised hours` : "log fieldwork hours first"
    },
    {
      key: "contacts",
      label: "Contacts",
      met: t.contacts >= requiredContacts,
      need: `${Math.max(requiredContacts - t.contacts, 0)} more supervision contact${requiredContacts - t.contacts === 1 ? "" : "s"}`
    },
    {
      key: "observation",
      label: "Client observation",
      met: t.observations >= 1,
      need: "1 supervisor-client observation"
    },
    {
      key: "individual",
      label: "Individual balance",
      met: t.supervised === 0 || t.groupSupervision <= t.individualSupervision,
      need: "more individual than group supervision"
    }
  ];
  const missing = checks.filter((check) => !check.met);
  return {
    type,
    yes: missing.length === 0,
    totals: t,
    requiredPct,
    requiredContacts,
    requiredSupervised,
    supervisionPct,
    missing,
    checks
  };
}

function pathSummary(path) {
  if (path.yes) return "Monthly requirements shown here are met.";
  const needs = path.missing.map((item) => item.need).filter(Boolean).slice(0, 2);
  return needs.length ? needs.join(" + ") : "Keep logging this month.";
}

function renderHome() {
  const monthEntries = entriesForMonth(currentMonth());
  const monthTotals = totals(monthEntries);
  const todayEntries = state.entries.filter((entry) => entry.date === todayIso());
  $("todayStatus").textContent = todayEntries.length ? `${todayEntries.length} entr${todayEntries.length === 1 ? "y" : "ies"} logged today` : "No entry logged today";
  const mode = cloud.user ? "cloud tracker" : "local tracker";
  $("profileStatus").textContent = state.profile.name ? `${state.profile.name}'s ${mode}` : cloud.user ? "Cloud profile ready" : "Local profile ready";
  $("monthHours").textContent = formatHours(monthTotals.total);
  $("supervisionPct").textContent = `${percent(monthTotals.supervised, monthTotals.total)}%`;
  $("unrestrictedPct").textContent = `${percent(monthTotals.unrestricted, monthTotals.total)}%`;
  renderHomePath(monthEntries);
}

function renderRecentEntries() {
  const recent = state.entries.slice(0, 3);
  $("recentEntries").innerHTML = recent.length ? recent.map(entryCard).join("") : `<div class="entry-card"><p class="muted">No entries yet.</p></div>`;
}

function entryCard(entry) {
  return `<article class="entry-card">
    <header>
      <div><strong>${formatDate(entry.date)} - ${entry.activityType}</strong><p class="muted">${entry.startTime}-${entry.endTime} - ${formatHours(entry.durationHours)} hours</p></div>
      <div>
        <button class="ghost-action" data-edit="${entry.id}">Edit</button>
        <button class="ghost-action danger-action" data-delete-entry="${entry.id}">Delete</button>
      </div>
    </header>
    <p>${escapeHtml(entry.notes || "No notes added")}</p>
    <footer>
      <span class="pill ${badgeClassFor(entry.activityCategory)}">${entry.activityCategory}</span>
      <span class="pill ${badgeClassFor(entry.experienceType)}">${entry.experienceType}</span>
      ${entry.supervisorId ? `<span class="pill other">${escapeHtml(supervisorName(entry.supervisorId))}</span>` : ""}
    </footer>
  </article>`;
}

function renderDashboard() {
  const monthEntries = entriesForMonth();
  const monthTotals = totals(monthEntries);
  $("dashTotal").textContent = formatHours(monthTotals.total);
  $("dashIndependent").textContent = formatHours(monthTotals.independent);
  $("dashSupervised").textContent = formatHours(monthTotals.supervised);
  $("dashRestricted").textContent = formatHours(monthTotals.restricted);
  $("dashUnrestricted").textContent = formatHours(monthTotals.unrestricted);
  $("dashContacts").textContent = String(monthTotals.contacts);
  const supervision = percent(monthTotals.supervised, monthTotals.total);
  const unrestricted = percent(monthTotals.unrestricted, monthTotals.total);
  $("dashSupervisionPct").textContent = `${supervision}%`;
  $("dashUnrestrictedPct").textContent = `${unrestricted}%`;
  $("supervisionBar").style.width = `${Math.min(supervision, 100)}%`;
  $("unrestrictedBar").style.width = `${Math.min(unrestricted, 100)}%`;
  renderMonthlyRows();
  renderQualityList(monthEntries);
  renderPathPanel(monthEntries);
}

function renderHomePath(entries) {
  const standard = evaluatePath(entries, "standard");
  const concentrated = evaluatePath(entries, "concentrated");
  $("homePathStatus").innerHTML = `
    <span class="path-chip ${standard.yes ? "yes" : "not-yet"}">Standard: ${standard.yes ? "Yes" : "Not yet"}</span>
    <span class="path-chip ${concentrated.yes ? "yes" : "not-yet"}">Concentrated: ${concentrated.yes ? "Yes" : "Not yet"}</span>
  `;
}

function renderPathPanel(entries) {
  const standard = evaluatePath(entries, "standard");
  const concentrated = evaluatePath(entries, "concentrated");
  setPathCard("standard", standard);
  setPathCard("concentrated", concentrated);
  const bestFit = concentrated.yes ? "This month can be tracked as concentrated based on these entries." : standard.yes ? "This month can be tracked as standard based on these entries." : "Not yet for standard or concentrated.";
  $("pathBestFit").textContent = bestFit;
  const focused = concentrated.yes ? concentrated : standard.yes ? standard : concentrated;
  $("pathDetail").innerHTML = focused.checks.map((check) => `<div><span>${check.label}</span><strong>${check.met ? "Yes" : "Not yet"}</strong></div>`).join("");
}

function setPathCard(prefix, path) {
  $(`${prefix}PathState`).textContent = path.yes ? "Yes" : "Not yet";
  $(`${prefix}PathHint`).textContent = pathSummary(path);
  $(`${prefix}PathCard`).classList.toggle("yes", path.yes);
  $(`${prefix}PathCard`).classList.toggle("not-yet", !path.yes);
}

function openMonthlyReview() {
  renderMonthlyReview();
  $("monthlyReviewDialog").showModal();
}

function renderMonthlyReview() {
  const key = $("dashboardMonth").value || currentMonth();
  const entries = entriesForMonth(key);
  const t = totals(entries);
  const docs = documentationStats(entries);
  const standard = evaluatePath(entries, "standard");
  const concentrated = evaluatePath(entries, "concentrated");
  const ready = entries.length > 0 && docs.missingNotes === 0 && docs.missingSupervisor === 0 && (standard.yes || concentrated.yes);

  $("reviewTitle").textContent = `${monthLabel(key)} Review`;
  $("reviewReadyState").textContent = ready ? "Ready" : "Not yet";
  $("reviewStandardState").textContent = standard.yes ? "Yes" : "Not yet";
  $("reviewConcentratedState").textContent = concentrated.yes ? "Yes" : "Not yet";
  $("monthlyReviewContent").innerHTML = `
    ${reviewSection("Totals", [
      ["Total hours", formatHours(t.total)],
      ["Restricted", formatHours(t.restricted)],
      ["Unrestricted", formatHours(t.unrestricted)],
      ["Independent", formatHours(t.independent)],
      ["Supervised", formatHours(t.supervised)]
    ])}
    ${reviewSection("Supervision", [
      ["Supervision %", `${percent(t.supervised, t.total)}%`],
      ["Contacts", t.contacts],
      ["Client observations", t.observations],
      ["Individual", formatHours(t.individualSupervision)],
      ["Group", formatHours(t.groupSupervision)]
    ])}
    ${reviewSection("Documentation", [
      ["Missing notes", docs.missingNotes],
      ["Thin notes", docs.thinNotes],
      ["Looks detailed", docs.detailedNotes],
      ["Supervised missing supervisor", docs.missingSupervisor],
      ["Manual overrides", docs.overrides],
      ["Other entries", docs.other]
    ], "Thin notes have fewer than 8 words.")}
    <section class="review-section">
      <h3>Entries</h3>
      <div class="review-entry-list">
        ${entries.length ? entries.map(reviewEntryCard).join("") : `<div class="review-empty">No entries logged for this month.</div>`}
      </div>
    </section>
  `;
}

function reviewSection(title, rows, helper = "") {
  return `<section class="review-section">
    <h3>${title}</h3>
    <div class="review-rows">
      ${rows.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}
    </div>
    ${helper ? `<p class="muted review-helper">${helper}</p>` : ""}
  </section>`;
}

function reviewEntryCard(entry) {
  return `<article class="review-entry-card">
    <div>
      <strong>${formatDate(entry.date)} - ${entry.activityType}</strong>
      <span>${entry.startTime}-${entry.endTime} - ${formatHours(entry.durationHours)} hrs${entry.supervisedHours ? ` - ${formatHours(entry.supervisedHours)} supervised` : ""}</span>
    </div>
    <div class="classification-panel">
      <span class="pill ${badgeClassFor(entry.activityCategory)}">${entry.activityCategory}</span>
      <span class="pill ${badgeClassFor(entry.experienceType)}">${entry.experienceType}</span>
      ${entry.supervisorId ? `<span class="pill other">${escapeHtml(supervisorName(entry.supervisorId))}</span>` : ""}
    </div>
    <p>${escapeHtml(entry.notes || "No notes added")}</p>
  </article>`;
}

function renderMonthlyRows() {
  const grouped = new Map();
  state.entries.forEach((entry) => {
    const key = monthKey(entry.date);
    grouped.set(key, [...(grouped.get(key) || []), entry]);
  });
  const rows = [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, entries]) => {
    const t = totals(entries);
    const notePct = percent(entries.filter((entry) => entry.notes).length, entries.length);
    return `<tr><td data-label="Month">${key}</td><td data-label="Total">${formatHours(t.total)}</td><td data-label="Restricted">${formatHours(t.restricted)}</td><td data-label="Unrestricted">${formatHours(t.unrestricted)}</td><td data-label="Supervised">${formatHours(t.supervised)}</td><td data-label="Supervision %">${percent(t.supervised, t.total)}%</td><td data-label="Notes">${notePct}%</td></tr>`;
  }).join("");
  $("monthlyRows").innerHTML = rows || `<tr><td data-label="Monthly summary" colspan="7">No monthly data yet.</td></tr>`;
}

function renderQualityList(entries) {
  const docs = documentationStats(entries);
  $("qualityList").innerHTML = [
    ["Entries missing notes", docs.missingNotes],
    ["Supervised entries missing supervisor", docs.missingSupervisor],
    ["Entries with manual override", docs.overrides],
    ["Entries marked Other", docs.other]
  ].map(([label, value]) => `<div class="quality-item"><strong>${value}</strong><p class="muted">${label}</p></div>`).join("");
}

function documentationStats(entries) {
  const noteWords = (entry) => entry.notes.trim().split(/\s+/).filter(Boolean).length;
  return {
    missingNotes: entries.filter((entry) => !entry.notes).length,
    thinNotes: entries.filter((entry) => entry.notes && noteWords(entry) < 8).length,
    detailedNotes: entries.filter((entry) => entry.notes && noteWords(entry) >= 8).length,
    missingSupervisor: entries.filter((entry) => entry.experienceType === "Supervised" && !entry.supervisorId).length,
    overrides: entries.filter((entry) => entry.manualOverride).length,
    other: entries.filter((entry) => entry.activityType === "Other").length
  };
}

function filteredEntries() {
  const from = $("filterFrom").value;
  const to = $("filterTo").value;
  const category = $("filterCategory").value;
  const supervisor = $("filterSupervisor").value;
  return state.entries.filter((entry) => {
    if (from && entry.date < from) return false;
    if (to && entry.date > to) return false;
    if (category && entry.activityCategory !== category) return false;
    if (supervisor && entry.supervisorId !== supervisor) return false;
    return true;
  });
}

function renderEntriesTable() {
  const rows = filteredEntries().map((entry) => `<tr>
    <td data-label="Date">${formatDate(entry.date)}</td>
    <td data-label="Time">${entry.startTime}-${entry.endTime}</td>
    <td data-label="Hours">${formatHours(entry.durationHours)}</td>
    <td data-label="Activity">${entry.activityType}</td>
    <td data-label="Category"><span class="pill ${badgeClassFor(entry.activityCategory)}">${entry.activityCategory}</span></td>
    <td data-label="Experience"><span class="pill ${badgeClassFor(entry.experienceType)}">${entry.experienceType}</span></td>
    <td data-label="Supervisor">${escapeHtml(supervisorName(entry.supervisorId) || "None")}</td>
    <td data-label="Notes">${escapeHtml(entry.notes || "")}</td>
    <td data-label="Action"><div class="row-actions"><button class="ghost-action" data-edit="${entry.id}">Edit</button><button class="ghost-action danger-action" data-delete-entry="${entry.id}">Delete</button></div></td>
  </tr>`).join("");
  $("entryRows").innerHTML = rows || `<tr><td data-label="Entries" colspan="9">No entries match these filters.</td></tr>`;
}

async function deleteEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  const ok = confirm(`Delete ${entry.activityType} from ${formatDate(entry.date)}? This cannot be undone.`);
  if (!ok) return;
  state.entries = state.entries.filter((item) => item.id !== id);
  saveState();
  renderAll();
  if (cloud.user) {
    try {
      await deleteCloudEntry(id);
      updateAuthUi();
    } catch (error) {
      setAuthStatus(`Delete error: ${error.message}`);
    }
  }
}

function renderSettings() {
  $("profileName").value = state.profile.name || "";
  $("profileEmail").value = state.profile.email || "";
  $("weeklyGoal").value = state.profile.weeklyGoal || 0;
  $("unrestrictedTarget").value = state.profile.unrestrictedTarget || 60;
  $("supervisionTarget").value = state.profile.supervisionTarget || 5;
  $("defaultSetting").value = state.profile.defaultSetting || "";
}

function renderSupervisors() {
  $("supervisorList").innerHTML = state.supervisors.map((sup) => `<article class="entry-card">
    <header><strong>${escapeHtml(sup.name)}</strong><button class="ghost-action" data-delete-supervisor="${sup.id}">Remove</button></header>
    <p class="muted">${escapeHtml([sup.credential, sup.organization, sup.email].filter(Boolean).join(" - ") || "No details")}</p>
  </article>`).join("");
}

function editEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  selectedActivity = entry.activityType;
  $("editingId").value = entry.id;
  $("date").value = entry.date;
  $("startTime").value = entry.startTime;
  $("endTime").value = entry.endTime;
  $("supervisorPresent").checked = entry.experienceType === "Supervised";
  $("clientPresent").checked = entry.clientPresent;
  $("supervisorId").value = entry.supervisorId || state.supervisors[0]?.id || "";
  $("supervisionType").value = entry.supervisionType === "None" ? "Individual" : entry.supervisionType;
  $("supervisionMethod").value = entry.supervisionMethod === "None" ? "In-person" : entry.supervisionMethod;
  $("supervisionSameTime").checked = !entry.supervisionStartTime || (entry.supervisionStartTime === entry.startTime && entry.supervisionEndTime === entry.endTime);
  $("supervisionStartTime").value = entry.supervisionStartTime || entry.startTime;
  $("supervisionEndTime").value = entry.supervisionEndTime || entry.endTime;
  $("supervisorClientObservation").checked = entry.supervisorClientObservation;
  $("manualOverride").checked = entry.manualOverride;
  $("activityCategory").value = entry.activityCategory;
  $("experienceType").value = entry.experienceType;
  $("overrideReason").value = entry.overrideReason || "";
  $("setting").value = entry.setting || "";
  $("notes").value = entry.notes || "";
  switchView("quickLog");
  syncConditionalFields();
  renderActivityButtons();
}

function resetForm() {
  $("entryForm").reset();
  $("editingId").value = "";
  selectedActivity = activityTypes[0].name;
  hydrateFormDefaults();
  renderActivityButtons();
}

function switchView(id) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === id));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
}

function renderSegments() {
  const rows = $("segments").querySelectorAll(".segment-card");
  if (rows.length) return;
  addSegment("12:00", "14:00", "Direct Therapy");
  addSegment("14:00", "14:20", "Graphing Data");
  addSegment("14:20", "14:30", "Supervision Meeting");
}

function addSegment(start = "", end = "", activity = "Direct Therapy") {
  const div = document.createElement("div");
  div.className = "segment-card";
  div.innerHTML = `
    <label>Start <input type="time" class="segment-start" value="${start}" required /></label>
    <label>End <input type="time" class="segment-end" value="${end}" required /></label>
    <label>Activity <select class="segment-activity">${activityTypes.map((item) => `<option ${item.name === activity ? "selected" : ""}>${item.name}</option>`).join("")}</select></label>
    <button type="button" class="icon-button segment-remove" aria-label="Remove segment">x</button>
    <label class="full">Notes <input class="segment-notes" placeholder="Optional segment notes" /></label>
  `;
  $("segments").appendChild(div);
}

async function saveSplitSession() {
  const parentId = crypto.randomUUID();
  const date = $("splitDate").value;
  const segments = [...$("segments").querySelectorAll(".segment-card")];
  const newEntries = [];
  segments.forEach((segment) => {
    const activity = getActivity(segment.querySelector(".segment-activity").value);
    const supervised = activity.experience === "Supervised";
    newEntries.push({
      id: crypto.randomUUID(),
      date,
      startTime: segment.querySelector(".segment-start").value,
      endTime: segment.querySelector(".segment-end").value,
      durationHours: decimalHours(segment.querySelector(".segment-start").value, segment.querySelector(".segment-end").value),
      activityType: activity.name,
      activityCategory: activity.category || "Restricted",
      experienceType: activity.experience || "Independent",
      supervisionType: supervised ? "Individual" : "None",
      supervisionMethod: supervised ? "In-person" : "None",
      supervisionStartTime: supervised ? segment.querySelector(".segment-start").value : "",
      supervisionEndTime: supervised ? segment.querySelector(".segment-end").value : "",
      supervisedHours: supervised ? decimalHours(segment.querySelector(".segment-start").value, segment.querySelector(".segment-end").value) : 0,
      individualSupervisionHours: supervised ? decimalHours(segment.querySelector(".segment-start").value, segment.querySelector(".segment-end").value) : 0,
      groupSupervisionHours: 0,
      supervisorId: supervised ? $("supervisorId").value : "",
      clientPresent: activity.clientPresent,
      supervisorClientObservation: activity.name.includes("Observation"),
      setting: state.profile.defaultSetting || "",
      notes: segment.querySelector(".segment-notes").value.trim(),
      manualOverride: false,
      overrideReason: "",
      parentSessionId: parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
  state.entries.push(...newEntries);
  state.entries.sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  saveState();
  renderAll();
  if (cloud.user) {
    try {
      for (const entry of newEntries) await saveCloudEntry(entry);
      updateAuthUi();
    } catch (error) {
      setAuthStatus(`Save error: ${error.message}`);
    }
  }
}

function exportRows() {
  return rowsForEntries(filteredEntries());
}

function rowsForEntries(entries) {
  return entries.map((entry) => ({
    Date: entry.date,
    Start: entry.startTime,
    End: entry.endTime,
    Hours: entry.durationHours,
    Activity: entry.activityType,
    Category: entry.activityCategory,
    Experience: entry.experienceType,
    "Supervision Type": entry.supervisionType,
    "Supervision Method": entry.supervisionMethod,
    "Supervision Start": entry.supervisionStartTime,
    "Supervision End": entry.supervisionEndTime,
    "Supervised Hours": entry.supervisedHours ?? (entry.experienceType === "Supervised" ? entry.durationHours : 0),
    "Individual Supervision Hours": entry.individualSupervisionHours ?? (entry.experienceType === "Supervised" && entry.supervisionType === "Individual" ? entry.durationHours : 0),
    "Group Supervision Hours": entry.groupSupervisionHours ?? (entry.experienceType === "Supervised" && entry.supervisionType === "Group" ? entry.durationHours : 0),
    "Independent Hours": Math.max(Number(entry.durationHours || 0) - Number(entry.supervisedHours ?? (entry.experienceType === "Supervised" ? entry.durationHours : 0)), 0),
    Supervisor: supervisorName(entry.supervisorId),
    "Client Present": entry.clientPresent ? "Yes" : "No",
    "Supervisor-Client Observation": entry.supervisorClientObservation ? "Yes" : "No",
    Setting: entry.setting,
    Notes: entry.notes,
    "Manual Override": entry.manualOverride ? "Yes" : "No",
    "Override Reason": entry.overrideReason,
    "Parent Session": entry.parentSessionId
  }));
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const rows = exportRows();
  downloadCsvRows(rows, `fieldwork-flow-${todayIso()}.csv`);
}

function exportMonthlyReviewCsv() {
  const key = $("dashboardMonth").value || currentMonth();
  downloadCsvRows(rowsForEntries(entriesForMonth(key)), `fieldwork-flow-review-${key}.csv`);
}

function downloadCsvRows(rows, filename) {
  const headers = Object.keys(rows[0] || { Date: "", Start: "", End: "", Hours: "" });
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\n");
  download(filename, csv, "text/csv;charset=utf-8");
}

function exportExcel() {
  const rows = exportRows();
  const headers = Object.keys(rows[0] || { Date: "", Start: "", End: "", Hours: "" });
  const table = `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(row[h] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  download(`fieldwork-flow-${todayIso()}.xls`, table, "application/vnd.ms-excel;charset=utf-8");
}

function buildPrintSummary() {
  const key = $("dashboardMonth").value || currentMonth();
  const monthEntries = entriesForMonth(key);
  const t = totals(monthEntries);
  return `
    <h2>${key}</h2>
    <p>Total: ${formatHours(t.total)} - Restricted: ${formatHours(t.restricted)} - Unrestricted: ${formatHours(t.unrestricted)} - Supervised: ${formatHours(t.supervised)} - Independent: ${formatHours(t.independent)} - Contacts: ${t.contacts} - Observations: ${t.observations}</p>
    <table><thead><tr><th>Date</th><th>Time</th><th>Hours</th><th>Supervision</th><th>Sup. Hours</th><th>Activity</th><th>Category</th><th>Experience</th><th>Supervisor</th><th>Notes</th></tr></thead>
    <tbody>${monthEntries.map((entry) => `<tr><td>${entry.date}</td><td>${entry.startTime}-${entry.endTime}</td><td>${formatHours(entry.durationHours)}</td><td>${entry.supervisionStartTime ? `${entry.supervisionStartTime}-${entry.supervisionEndTime}` : ""}</td><td>${formatHours(entry.supervisedHours || 0)}</td><td>${escapeHtml(entry.activityType)}</td><td>${entry.activityCategory}</td><td>${entry.experienceType}</td><td>${escapeHtml(supervisorName(entry.supervisorId) || "None")}</td><td>${escapeHtml(entry.notes || "")}</td></tr>`).join("")}</tbody></table>
  `;
}

function printSummary() {
  let summary = document.querySelector(".print-summary");
  if (!summary) {
    summary = $("printTemplate").content.firstElementChild.cloneNode(true);
    document.querySelector(".app-shell").appendChild(summary);
  }
  summary.querySelector("#printContent").innerHTML = buildPrintSummary();
  window.print();
}

function formatDate(date) {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

document.addEventListener("click", async (event) => {
  const activityButton = event.target.closest("[data-activity]");
  if (activityButton) {
    selectedActivity = activityButton.dataset.activity;
    $("manualOverride").checked = selectedActivity === "Other";
    applyActivityDefaults();
    renderActivityButtons();
  }

  const editButton = event.target.closest("[data-edit]");
  if (editButton) editEntry(editButton.dataset.edit);

  const deleteEntryButton = event.target.closest("[data-delete-entry]");
  if (deleteEntryButton) await deleteEntry(deleteEntryButton.dataset.deleteEntry);

  const removeSegment = event.target.closest(".segment-remove");
  if (removeSegment) removeSegment.closest(".segment-card").remove();

  const deleteSupervisor = event.target.closest("[data-delete-supervisor]");
  if (deleteSupervisor && state.supervisors.length > 1) {
    const id = deleteSupervisor.dataset.deleteSupervisor;
    state.supervisors = state.supervisors.filter((sup) => sup.id !== deleteSupervisor.dataset.deleteSupervisor);
    saveState();
    renderAll();
    if (cloud.user) {
      try {
        await deleteCloudSupervisor(id);
        updateAuthUi();
      } catch (error) {
        setAuthStatus(`Delete error: ${error.message}`);
      }
    }
  }
});

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));

["startTime", "endTime", "supervisorPresent", "clientPresent", "manualOverride", "activityCategory", "experienceType", "supervisionSameTime", "supervisionStartTime", "supervisionEndTime", "supervisionType"].forEach((id) => {
  $(id).addEventListener("input", syncConditionalFields);
  $(id).addEventListener("change", syncConditionalFields);
});

$("entryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await upsertEntry(collectEntry());
  resetForm();
});

$("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  state.profile = {
    name: $("profileName").value.trim(),
    email: $("profileEmail").value.trim(),
    weeklyGoal: Number($("weeklyGoal").value || 0),
    unrestrictedTarget: Number($("unrestrictedTarget").value || 60),
    supervisionTarget: Number($("supervisionTarget").value || 5),
    defaultSetting: $("defaultSetting").value.trim()
  };
  saveState();
  renderAll();
  if (cloud.user) {
    try {
      await saveCloudSettings();
      updateAuthUi();
    } catch (error) {
      setAuthStatus(`Settings error: ${error.message}`);
    }
  }
});

$("supervisorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const supervisor = {
    id: crypto.randomUUID(),
    name: $("supervisorName").value.trim(),
    credential: $("supervisorCredential").value.trim(),
    email: $("supervisorEmail").value.trim(),
    organization: $("supervisorOrg").value.trim(),
    active: true
  };
  state.supervisors.push(supervisor);
  event.target.reset();
  saveState();
  renderAll();
  if (cloud.user) {
    try {
      const saved = await saveCloudSupervisor(supervisor);
      if (saved) {
        state.supervisors = state.supervisors.map((sup) => sup.id === supervisor.id ? saved : sup);
        saveState();
        renderAll();
      }
      updateAuthUi();
    } catch (error) {
      setAuthStatus(`Supervisor error: ${error.message}`);
    }
  }
});

["filterFrom", "filterTo", "filterCategory", "filterSupervisor", "dashboardMonth"].forEach((id) => {
  $(id).addEventListener("input", renderAll);
  $(id).addEventListener("change", renderAll);
});

$("resetFormBtn").addEventListener("click", resetForm);
$("exportCsvBtn").addEventListener("click", exportCsv);
$("exportExcelBtn").addEventListener("click", exportExcel);
$("printBtn").addEventListener("click", printSummary);
$("openMonthlyReviewBtn").addEventListener("click", openMonthlyReview);
$("closeMonthlyReviewBtn").addEventListener("click", () => $("monthlyReviewDialog").close());
$("reviewCsvBtn").addEventListener("click", exportMonthlyReviewCsv);
$("reviewPrintBtn").addEventListener("click", printSummary);
$("signInBtn").addEventListener("click", signIn);
$("signUpBtn").addEventListener("click", signUp);
$("signOutBtn").addEventListener("click", signOut);
$("splitSessionBtn").addEventListener("click", () => {
  renderSegments();
  $("splitDialog").showModal();
});
$("addSegmentBtn").addEventListener("click", () => addSegment());
$("closeSplitBtn").addEventListener("click", () => $("splitDialog").close());
$("cancelSplitBtn").addEventListener("click", () => $("splitDialog").close());
$("splitForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSplitSession();
  $("splitDialog").close();
});

hydrateFormDefaults();
renderAll();
initSupabase();
