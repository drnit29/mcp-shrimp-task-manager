// Global variables
let tasks = [];
let selectedTaskId = null;
let searchTerm = "";
let sortOption = "date-asc";
let globalAnalysisResult = null; // Added: Store global analysis result
let svg, g, simulation; // << Modified: Define D3 related variables

// Added: i18n global variables (though i18n is being removed)
let currentLang = "en"; // Default language
let translations = {}; // Store loaded translations (will be unused)

// DOM elements
const taskListElement = document.getElementById("task-list");
const taskDetailsContent = document.getElementById("task-details-content");
const statusFilter = document.getElementById("status-filter");
const currentTimeElement = document.getElementById("current-time");
const progressIndicator = document.getElementById("progress-indicator");
const progressCompleted = document.getElementById("progress-completed");
const progressInProgress = document.getElementById("progress-in-progress");
const progressPending = document.getElementById("progress-pending");
const progressLabels = document.getElementById("progress-labels");
const dependencyGraphElement = document.getElementById("dependency-graph");
const globalAnalysisResultElement = document.getElementById(
  "global-analysis-result"
); // Assuming this element exists in HTML
const langSwitcher = document.getElementById("lang-switcher"); // << Added: Get switcher element (will be unused)

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  // fetchTasks(); // Will be triggered by initI18n() - Commented out as i18n is removed
 fetchTasks(); // Fetch tasks directly as i18n is removed
 // applyTranslations(); // Apply translations for data-i18n-key elements - Removed as i18n is deprecated
  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);

  // Event listeners
  // statusFilter.addEventListener("change", renderTasks); // Will be triggered by changeLanguage or after applyTranslations - Commented out
  if (statusFilter) {
    statusFilter.addEventListener("change", renderTasks);
  }

  // Added: Search and sort event listeners
  const searchInput = document.getElementById("search-input");
  const sortOptions = document.getElementById("sort-options");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchTerm = e.target.value.toLowerCase();
      renderTasks();
    });
  }

  if (sortOptions) {
    sortOptions.addEventListener("change", (e) => {
      sortOption = e.target.value;
      renderTasks();
    });
  }

  // Added: Set up SSE connection
  setupSSE();

  // Added: Language switcher event listener (will be unused)
});

// Removed i18n core functions as the app is now English-only.

// Fetch task data
async function fetchTasks() {
  try {
    // Show loading on initial load (now using static string)
    if (tasks.length === 0) {
      taskListElement.innerHTML = `<div class="loading">Loading...</div>`;

    }

    const response = await fetch("/api/tasks");

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const newTasks = data.tasks || [];

    // Extract global analysis result (find the first non-empty one)
    let foundAnalysisResult = null;
    for (const task of newTasks) {
      if (task.analysisResult) {
        foundAnalysisResult = task.analysisResult;
        break; // Found one, that's enough
      }
    }
    // Only update if the found result is different from the currently stored one
    if (foundAnalysisResult !== globalAnalysisResult) {
      globalAnalysisResult = foundAnalysisResult;
      renderGlobalAnalysisResult(); // Update display
    }

    // --- Smart update logic (preliminary - still needs improvement to avoid flickering) ---
    // Simply compare task count or identifiers to decide whether to re-render
    // Ideally, compare each task's content and perform DOM updates
    const tasksChanged = didTasksChange(tasks, newTasks);

    if (tasksChanged) {
      tasks = newTasks; // Update global task list
      console.log("Tasks updated via fetch, re-rendering...");
      renderTasks();
      updateProgressIndicator();
      renderDependencyGraph(); // Update graph
    } else {
      console.log(
        "No significant task changes detected, skipping full re-render."
      );
      // If no need to re-render the list, maybe just update the progress bar
      updateProgressIndicator();
      // Consider whether to update the graph (if status might change)
      // renderDependencyGraph(); // Temporarily commented out, unless status change is critical
    }

    // *** Removed setTimeout polling ***
    // setTimeout(fetchTasks, 30000);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    // Avoid overwriting existing list, unless it's an initial load failure
    if (tasks.length === 0) {
      taskListElement.innerHTML = `<div class="error">Failed to load tasks: ${error.message}</div>`;


      if (progressIndicator) progressIndicator.style.display = "none";
      if (dependencyGraphElement)
        dependencyGraphElement.innerHTML = `<div class="error">Failed to load dependency graph</div>`;


    } else {
      showTemporaryError(`Failed to update tasks: ${error.message}`);


    }
  }
}

// Added: Set up Server-Sent Events connection
function setupSSE() {
  console.log("Setting up SSE connection to /api/tasks/stream");
  const evtSource = new EventSource("/api/tasks/stream");

  evtSource.onmessage = function (event) {
    console.log("SSE message received:", event.data);
    // Can make more complex judgments based on event.data content, currently updates on any message
  };

  evtSource.addEventListener("update", function (event) {
    console.log("SSE 'update' event received:", event.data);
    // Received update event, re-fetch task list
    fetchTasks();
  });

  evtSource.onerror = function (err) {
    console.error("EventSource failed:", err);
    // Can implement reconnection logic
    evtSource.close(); // Close the erroneous connection
    // Try to reconnect after a delay
    setTimeout(setupSSE, 5000); // Retry after 5 seconds
  };

  evtSource.onopen = function () {
    console.log("SSE connection opened.");
  };
}

// Added: Helper function to compare if task list has changed (most comprehensive version)
function didTasksChange(oldTasks, newTasks) {
  if (!oldTasks || !newTasks) return true; // Handle initial load or error states

  if (oldTasks.length !== newTasks.length) {
    console.log("Task length changed.");
    return true; // Length change definitely needs update
  }

  const oldTaskMap = new Map(oldTasks.map((task) => [task.id, task]));
  const newTaskIds = new Set(newTasks.map((task) => task.id)); // For checking removed tasks

  // Check for removed tasks first
  for (const oldTask of oldTasks) {
    if (!newTaskIds.has(oldTask.id)) {
      console.log(`Task removed: ${oldTask.id}`);
      return true;
    }
  }

  // Check for new or modified tasks
  for (const newTask of newTasks) {
    const oldTask = oldTaskMap.get(newTask.id);
    if (!oldTask) {
      console.log(`New task found: ${newTask.id}`);
      return true; // New task ID found
    }

    // Compare relevant fields
    const fieldsToCompare = [
      "name",
      "description",
      "status",
      "notes",
      "implementationGuide",
      "verificationCriteria",
      "summary",
    ];

    for (const field of fieldsToCompare) {
      if (oldTask[field] !== newTask[field]) {
        // Handle null/undefined comparisons carefully if needed
        // e.g., !(oldTask[field] == null && newTask[field] == null) checks if one is null/undefined and the other isn't
        if (
          !(oldTask[field] === null && newTask[field] === null) &&
          !(oldTask[field] === undefined && newTask[field] === undefined)
        ) {
          console.log(`Task ${newTask.id} changed field: ${field}`);
          return true;
        }
      }
    }

    // Compare dependencies (array of strings or objects)
    if (!compareDependencies(oldTask.dependencies, newTask.dependencies)) {
      console.log(`Task ${newTask.id} changed field: dependencies`);
      return true;
    }

    // Compare relatedFiles (array of objects) - simple length check first
    if (!compareRelatedFiles(oldTask.relatedFiles, newTask.relatedFiles)) {
      console.log(`Task ${newTask.id} changed field: relatedFiles`);
      return true;
    }

    // Optional: Compare updatedAt as a final check if other fields seem identical
    if (oldTask.updatedAt?.toString() !== newTask.updatedAt?.toString()) {
      console.log(`Task ${newTask.id} changed field: updatedAt (fallback)`);
      return true;
    }
  }

  return false; // No significant changes detected
}

// Helper function to compare dependency arrays
function compareDependencies(deps1, deps2) {
  const arr1 = deps1 || [];
  const arr2 = deps2 || [];

  if (arr1.length !== arr2.length) return false;

  // Extract IDs whether they are strings or objects {taskId: string}
  const ids1 = new Set(
    arr1.map((dep) =>
      typeof dep === "object" && dep !== null ? dep.taskId : dep
    )
  );
  const ids2 = new Set(
    arr2.map((dep) =>
      typeof dep === "object" && dep !== null ? dep.taskId : dep
    )
  );

  if (ids1.size !== ids2.size) return false; // Different number of unique deps
  for (const id of ids1) {
    if (!ids2.has(id)) return false;
  }
  return true;
}

// Helper function to compare relatedFiles arrays (can be simple or complex)
function compareRelatedFiles(files1, files2) {
  const arr1 = files1 || [];
  const arr2 = files2 || [];

  if (arr1.length !== arr2.length) return false;

  // Simple comparison: check if paths and types are the same in the same order
  // For a more robust check, convert to Sets of strings like `path|type` or do deep object comparison
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i].path !== arr2[i].path || arr1[i].type !== arr2[i].type) {
      return false;
    }
    // Add more field comparisons if needed (description, lines, etc.)
    // if (arr1[i].description !== arr2[i].description) return false;
  }
  return true;
}

// Added: Function to show temporary error messages
function showTemporaryError(message) {
  const errorElement = document.createElement("div");
  errorElement.className = "temporary-error";
  errorElement.textContent = message; // Keep the message itself
  document.body.appendChild(errorElement);
  setTimeout(() => {
    errorElement.remove();
  }, 3000); // Display for 3 seconds
}

// Render task list - *** Needs further optimization for smart updates ***
function renderTasks() {
  console.log("Rendering tasks..."); // Add log
  const filterValue = statusFilter.value;

  let filteredTasks = tasks;
  if (filterValue !== "all") {
    filteredTasks = filteredTasks.filter((task) => task.status === filterValue);
  }

  if (searchTerm) {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    filteredTasks = filteredTasks.filter(
      (task) =>
        (task.name && task.name.toLowerCase().includes(lowerCaseSearchTerm)) ||
        (task.description &&
          task.description.toLowerCase().includes(lowerCaseSearchTerm))
    );
  }

  filteredTasks.sort((a, b) => {
    switch (sortOption) {
      case "name-asc":
        return (a.name || "").localeCompare(b.name || "");
      case "name-desc":
        return (b.name || "").localeCompare(a.name || "");
      case "status":
        const statusOrder = { pending: 1, in_progress: 2, completed: 3 };
        return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
      case "date-asc":
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      case "date-desc":
      default:
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }
  });

  // --- Simple replacement (causes flickering) ---
  // TODO: Implement DOM Diffing or smarter update strategy
  if (filteredTasks.length === 0) {
    taskListElement.innerHTML = `<div class="placeholder">No matching tasks</div>`;

  } else {
    taskListElement.innerHTML = filteredTasks
      .map(
        (task) => `
            <div class="task-item status-${task.status.replace(
              "_",
              "-"
            )}" data-id="${task.id}" onclick="selectTask('${task.id}')">
            <h3>${task.name}</h3>
            <div class="task-meta">
                <span class="task-status status-${task.status.replace(
                  "_",
                  "-"
                )}">${getStatusText(task.status)}</span>
            </div>
            </div>
        `
      )
      .join("");
  }
  // --- End simple replacement ---

  // Reapply selected state
  if (selectedTaskId) {
    const taskExists = tasks.some((t) => t.id === selectedTaskId);
    if (taskExists) {
      const selectedElement = document.querySelector(
        `.task-item[data-id="${selectedTaskId}"]`
      );
      if (selectedElement) {
        selectedElement.classList.add("selected");
      }
    } else {
      // If the selected task no longer exists in the new list, clear selection
      console.log(
        `Selected task ${selectedTaskId} no longer exists, clearing selection.`
      );
      selectedTaskId = null;
      taskDetailsContent.innerHTML = `<p class="placeholder">Select a task to view details</p>`;

      highlightNode(null); // Clear graph highlight
    }
  }
}

// Select task
function selectTask(taskId) {
  // Clear old selected state and highlight
  if (selectedTaskId) {
    const previousElement = document.querySelector(
      `.task-item[data-id="${selectedTaskId}"]`
    );
    if (previousElement) {
      previousElement.classList.remove("selected");
    }
  }

  // If the same task is clicked again, deselect it
  if (selectedTaskId === taskId) {
    selectedTaskId = null;
    taskDetailsContent.innerHTML = `<p class="placeholder">Select a task to view details</p>`;

    highlightNode(null); // Deselect highlight
    return;
  }

  selectedTaskId = taskId;

  // Add new selected state
  const selectedElement = document.querySelector(
    `.task-item[data-id="${taskId}"]`
  );
  if (selectedElement) {
    selectedElement.classList.add("selected");
  }

  // Get and display task details
  const task = tasks.find((t) => t.id === taskId);

  if (!task) {
    taskDetailsContent.innerHTML = `<div class="placeholder">Task not found</div>`;

    return;
  }

  // --- Safely populate task details ---
  // 1. Create basic skeleton (using innerHTML, but replace dynamic content with empty elements with IDs)
  taskDetailsContent.innerHTML = `
    <div class="task-details-header">
      <h3 id="detail-name"></h3>
      <div class="task-meta">
        <span>Status: <span id="detail-status" class="task-status"></span></span>
      </div>
    </div>
    
    <!-- Added: Conditionally display Summary -->
    <div class="task-details-section" id="detail-summary-section" style="display: none;">
      <h4>Completion Summary</h4>
      <p id="detail-summary"></p>
    </div>
    
    <div class="task-details-section">
      <h4>Task Description</h4>
      <p id="detail-description"></p>
    </div>
    
    <div class="task-details-section">
      <h4>Implementation Guide</h4>
      <pre id="detail-implementation-guide"></pre>
    </div>
    
    <div class="task-details-section">
      <h4>Verification Criteria</h4>
      <p id="detail-verification-criteria"></p>
    </div>
    
    <div class="task-details-section">
      <h4>Dependencies (Prerequisites)</h4>
      <div class="dependencies" id="detail-dependencies">
        <!-- Dependencies will be populated by JS -->
      </div>
    </div>
    
    <div class="task-details-section">
      <h4>Related Files</h4>
      <div class="related-files" id="detail-related-files">
        <!-- Related files will be populated by JS -->
      </div>
    </div>

    <div class="task-details-section">
      <h4>Notes</h4>
      <p id="detail-notes"></p>
    </div>
  `;

  // 2. Get corresponding elements and safely populate content using textContent
  const detailName = document.getElementById("detail-name");
  const detailStatus = document.getElementById("detail-status");
  const detailDescription = document.getElementById("detail-description");
  const detailImplementationGuide = document.getElementById(
    "detail-implementation-guide"
  );
  const detailVerificationCriteria = document.getElementById(
    "detail-verification-criteria"
  );
  // Added: Get Summary related elements
  const detailSummarySection = document.getElementById(
    "detail-summary-section"
  );
  const detailSummary = document.getElementById("detail-summary");
  const detailNotes = document.getElementById("detail-notes");
  const detailDependencies = document.getElementById("detail-dependencies");
  const detailRelatedFiles = document.getElementById("detail-related-files");

  if (detailName) detailName.textContent = task.name;
  if (detailStatus) {
    detailStatus.textContent = getStatusText(task.status);
    detailStatus.className = `task-status status-${task.status.replace(
      "_",
      "-"
    )}`;
  }
  if (detailDescription)
    detailDescription.textContent =
      task.description || "No description";
  if (detailImplementationGuide)
    detailImplementationGuide.textContent =
      task.implementationGuide ||
      "No implementation guide";
  if (detailVerificationCriteria)
    detailVerificationCriteria.textContent =
      task.verificationCriteria ||
      "No verification criteria";

  // Added: Populate Summary (if it exists and task is completed)
  if (task.summary && detailSummarySection && detailSummary) {
    detailSummary.textContent = task.summary;
    detailSummarySection.style.display = "block"; // Show section
  } else if (detailSummarySection) {
    detailSummarySection.style.display = "none"; // Hide section
  }

  if (detailNotes)
    detailNotes.textContent = task.notes || "No notes";

  // 3. Dynamically generate dependencies and related files (these can include safe HTML structures like span)
  if (detailDependencies) {
    const dependenciesHtml =
      task.dependencies && task.dependencies.length
        ? task.dependencies
            .map((dep) => {
              const depId =
                typeof dep === "object" && dep !== null && dep.taskId
                  ? dep.taskId
                  : dep;
              const depTask = tasks.find((t) => t.id === depId);
              // Fallback text for unknown dependency
              const depName = depTask
                ? depTask.name
                : `Unknown Task (${depId})`;
              const span = document.createElement("span");
              span.className = "dependency-tag";
              span.dataset.id = depId;
              span.textContent = depName;
              span.onclick = () => highlightNode(depId);
              return span.outerHTML;
            })
            .join("")
        : `<span class="placeholder">No dependencies</span>`; // Static placeholder

    detailDependencies.innerHTML = dependenciesHtml;
  }

  if (detailRelatedFiles) {
    const relatedFilesHtml =
      task.relatedFiles && task.relatedFiles.length
        ? task.relatedFiles
            .map((file) => {
              const span = document.createElement("span");
              span.className = "file-tag";
              span.title = file.description || "";
              const pathText = document.createTextNode(`${file.path} `);
              const small = document.createElement("small");
              small.textContent = `(${file.type})`; // Type is likely technical, maybe no translation needed?
              span.appendChild(pathText);
              span.appendChild(small);
              return span.outerHTML;
            })
            .join("")
        : `<span class="placeholder">No related files</span>`; // Static placeholder

    detailRelatedFiles.innerHTML = relatedFilesHtml;
  }

  // --- Original innerHTML assignment removed ---

  // Only call the highlight function
  highlightNode(taskId); // Only call highlightNode
}

// Render dependency graph - Modified for global view and enter/update/exit pattern
function renderDependencyGraph() {
  if (!dependencyGraphElement || !window.d3) {
    console.warn("D3 or dependency graph element not found.");
    if (dependencyGraphElement) {
      // Show hint on first load or if D3 is missing, don't clear existing graph
      if (!dependencyGraphElement.querySelector("svg")) {
        dependencyGraphElement.innerHTML = `<p class="placeholder">Failed to load dependency graph</p>`; // Using "error_loading_graph"

      }
    }
    return;
  }

  // If no tasks, clear the graph and show a hint
  if (tasks.length === 0) {
    dependencyGraphElement.innerHTML = `<p class="placeholder">Dependency relationship for all tasks</p>`; // Using "dependency_graph_placeholder"

    // Reset SVG and simulation variables for correct initialization next time
    svg = null;
    g = null;
    simulation = null;
    return;
  }

  // 1. Prepare nodes and links
  const nodes = tasks.map((task) => ({
    id: task.id,
    name: task.name,
    status: task.status,
    // Retain existing positions for smooth transition
    x: simulation?.nodes().find((n) => n.id === task.id)?.x,
    y: simulation?.nodes().find((n) => n.id === task.id)?.y,
    fx: simulation?.nodes().find((n) => n.id === task.id)?.fx, // Retain fixed positions
    fy: simulation?.nodes().find((n) => n.id === task.id)?.fy,
  }));

  const links = [];
  tasks.forEach((task) => {
    if (task.dependencies && task.dependencies.length > 0) {
      task.dependencies.forEach((dep) => {
        const sourceId = typeof dep === "object" ? dep.taskId : dep;
        const targetId = task.id;
        if (
          nodes.some((n) => n.id === sourceId) &&
          nodes.some((n) => n.id === targetId)
        ) {
          // Ensure link's source/target are IDs for force layout identification
          links.push({ source: sourceId, target: targetId });
        } else {
          console.warn(
            `Dependency link ignored: Task ${sourceId} or ${targetId} not found in task list.`
          );
        }
      });
    }
  });

  // 2. D3 drawing setup and update
  const width = dependencyGraphElement.clientWidth;
  const height = dependencyGraphElement.clientHeight || 400;

  if (!svg) {
    // --- First render ---
    console.log("First render of dependency graph");
    dependencyGraphElement.innerHTML = ""; // Clear placeholder

    svg = d3
      .select(dependencyGraphElement)
      .append("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("preserveAspectRatio", "xMidYMid meet");

    g = svg.append("g"); // Main group for zoom and pan

    // Add zoom and pan
    svg.call(
      d3.zoom().on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
    );

    // Add arrow definition
    g.append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "-0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#999");

    // Initialize force simulation
    simulation = d3
      .forceSimulation() // Initialize without nodes
      .force(
        "link",
        d3
          .forceLink()
          .id((d) => d.id)
          .distance(100) // Specify ID accessor
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30))
      .on("tick", ticked); // Bind tick event handler

    // Add groups for links and nodes
    g.append("g").attr("class", "links");
    g.append("g").attr("class", "nodes");
  } else {
    // --- Update render ---
    console.log("Updating dependency graph");
    // Update SVG dimensions and center force (if window size changed)
    svg.attr("viewBox", [0, 0, width, height]);
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
  }

  // 3. Update links
  const linkSelection = g
    .select(".links") // Select the g element for links
    .selectAll("line.link")
    .data(
      links,
      (d) => `${d.source.id || d.source}-${d.target.id || d.target}`
    ); // Key function based on source/target ID

  // Exit - Remove old links
  linkSelection
    .exit()
    .transition("exit")
    .duration(300)
    .attr("stroke-opacity", 0)
    .remove();

  // Enter - Add new links
  const linkEnter = linkSelection
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("stroke", "#999")
    .attr("marker-end", "url(#arrowhead)")
    .attr("stroke-opacity", 0); // Initial transparency

  // Update + Enter - Update attributes of all links (merge enter and update selections)
  const linkUpdate = linkSelection.merge(linkEnter);

  linkUpdate
    .transition("update")
    .duration(500)
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", 1.5);

  // 4. Update nodes
  const nodeSelection = g
    .select(".nodes") // Select the g element for nodes
    .selectAll("g.node-item")
    .data(nodes, (d) => d.id); // Use ID as key

  // Exit - Remove old nodes
  nodeSelection
    .exit()
    .transition("exit")
    .duration(300)
    .attr("transform", (d) => `translate(${d.x || 0}, ${d.y || 0}) scale(0)`) // Scale down and disappear from current position
    .attr("opacity", 0)
    .remove();

  // Enter - Add new node groups
  const nodeEnter = nodeSelection
    .enter()
    .append("g")
    .attr("class", (d) => `node-item status-${getStatusClass(d.status)}`) // Use helper function to set class
    .attr("data-id", (d) => d.id)
    // Initial position: appear from simulation-calculated position (if exists) or random, initial scale 0
    .attr(
      "transform",
      (d) =>
        `translate(${d.x || Math.random() * width}, ${
          d.y || Math.random() * height
        }) scale(0)`
    )
    .attr("opacity", 0)
    .call(drag(simulation)); // Add drag

  // Add circles to Enter selection
  nodeEnter
    .append("circle")
    .attr("r", 10)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5);
  // Color will be set via update transition after merge

  // Add text to Enter selection
  nodeEnter
    .append("text")
    .attr("x", 15)
    .attr("y", 3)
    .text((d) => d.name)
    .attr("font-size", "10px")
    .attr("fill", "#ccc");

  // Add title (tooltip) to Enter selection
  nodeEnter
    .append("title")
    .text((d) => `${d.name} (${getStatusText(d.status)})`);

  // Add click event to Enter selection
  nodeEnter.on("click", (event, d) => {
    selectTask(d.id);
    event.stopPropagation();
  });

  // Update + Enter - Merge and update all nodes
  const nodeUpdate = nodeSelection.merge(nodeEnter);

  // Transition to final position and state
  nodeUpdate
    .transition("update")
    .duration(500)
    .attr("transform", (d) => `translate(${d.x || 0}, ${d.y || 0}) scale(1)`) // Move to simulated position and restore size
    .attr("opacity", 1);

  // Update node color (separate transition)
  nodeUpdate
    .select("circle")
    .transition("color")
    .duration(500)
    .attr("fill", getNodeColor); // Use existing getNodeColor function

  // Update node status Class (instant update, no transition needed)
  nodeUpdate.attr(
    "class",
    (d) => `node-item status-${getStatusClass(d.status)}`
  );

  // << Added: Redefine drag function >>
  function drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      // Unfix position, allowing node to be affected by force layout again (if needed)
      // d.fx = null;
      // d.fy = null;
      // Or keep fixed position until dragged again
    }

    return d3
      .drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }
  // << drag function definition end >>

  // 5. Update force simulation
  simulation.nodes(nodes); // Update simulation nodes after handling enter/exit
  simulation.force("link").links(links); // Update simulation links
  simulation.alpha(0.3).restart(); // Reactivate simulation
}

// Tick function: Update node and link positions
function ticked() {
  if (!g) return;

  // Update link positions
  g.select(".links")
    .selectAll("line.link")
    .attr("x1", (d) => d.source.x)
    .attr("y1", (d) => d.source.y)
    .attr("x2", (d) => d.target.x)
    .attr("y2", (d) => d.target.y);

  // Update node group positions
  g.select(".nodes")
    .selectAll("g.node-item")
    // << Modified: Add coordinate fallback >>
    .attr("transform", (d) => `translate(${d.x || 0}, ${d.y || 0})`);
}

// Function: Return color based on node data (example)
function getNodeColor(nodeData) {
  switch (nodeData.status) {
    case "completed": // Was "已完成"
      return "var(--secondary-color)";
    case "in_progress": // Was "進行中"
      return "var(--primary-color)";
    case "pending": // Was "待處理"
      return "#f1c40f"; // Consistent with progress bar and status tags
    default:
      return "#7f8c8d"; // Unknown status
  }
}

// Helper function
function getStatusText(status) {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

function updateCurrentTime() {
  const now = new Date();
  // Keep original format, if localized time is needed, use translate or other library here
  const timeString = now.toLocaleString(); // Consider if formatting based on currentLang is needed
  if (currentTimeElement) {
    // Separate static text and dynamic time
    const footerTextElement = currentTimeElement.parentNode.childNodes[0];
    if (footerTextElement && footerTextElement.nodeType === Node.TEXT_NODE) {
      footerTextElement.nodeValue = "© 2023 Shrimp Task Manager - Current time: ";
    }
    currentTimeElement.textContent = timeString;
  }
}
// Update project progress indicator
function updateProgressIndicator() {
  const totalTasks = tasks.length;
  if (totalTasks === 0) {
    progressIndicator.style.display = "none"; // Hide when no tasks
    return;
  }

  progressIndicator.style.display = "block"; // Ensure visible

  const completedTasks = tasks.filter(
    (task) => task.status === "completed" // Was "已完成"
  ).length;
  const inProgressTasks = tasks.filter(
    (task) => task.status === "in_progress" // Was "進行中"
  ).length;
  const pendingTasks = tasks.filter((task) => task.status === "pending").length; // Was "待處理"

  const completedPercent =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const inProgressPercent =
    totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0;
  const pendingPercent = totalTasks > 0 ? (pendingTasks / totalTasks) * 100 : 0;

  progressCompleted.style.width = `${completedPercent}%`;
  progressInProgress.style.width = `${inProgressPercent}%`;
  progressPending.style.width = `${pendingPercent}%`;

  // Update labels (using static strings)
  progressLabels.innerHTML = `
    <span class="label-completed">Completed: ${completedTasks} (${completedPercent.toFixed(1)}%)</span>
    <span class="label-in-progress">In Progress: ${inProgressTasks} (${inProgressPercent.toFixed(1)}%)</span>
    <span class="label-pending">Pending: ${pendingTasks} (${pendingPercent.toFixed(1)}%)</span>
    <span class="label-total">Total: ${totalTasks}</span>
  `;
}

// Added: Render global analysis result
function renderGlobalAnalysisResult() {
  let targetElement = document.getElementById("global-analysis-result");

  // If element doesn't exist, try to create and add it to a suitable place (e.g., after header or before main content)
  if (!targetElement) {
    targetElement = document.createElement("div");
    targetElement.id = "global-analysis-result";
    targetElement.className = "global-analysis-section"; // Add style class
    // Try to insert after header or before main
    const header = document.querySelector("header");
    const mainContent = document.querySelector("main");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(targetElement, header.nextSibling);
    } else if (mainContent && mainContent.parentNode) {
      mainContent.parentNode.insertBefore(targetElement, mainContent);
    } else {
      // As a last resort, add to the beginning of the body
      document.body.insertBefore(targetElement, document.body.firstChild);
    }
  }

  if (globalAnalysisResult) {
    targetElement.innerHTML = `
            <h4 data-i18n-key="global_analysis_title">Goal</h4>
            <pre>${globalAnalysisResult}</pre>
        `;
    targetElement.style.display = "block";
  } else {
    targetElement.style.display = "none"; // Hide if no result
    targetElement.innerHTML = ""; // Clear content
  }
}

// Added: Highlight node in dependency graph
function highlightNode(taskId, status = null) {
  if (!g || !window.d3) return;

  // Clear highlight from all nodes
  g.select(".nodes") // Select from g
    .selectAll("g.node-item")
    .classed("highlighted", false);

  if (!taskId) return;

  // Highlight selected node
  const selectedNode = g
    .select(".nodes") // Select from g
    .select(`g.node-item[data-id="${taskId}"]`);
  if (!selectedNode.empty()) {
    selectedNode.classed("highlighted", true);
    // Optionally bring selected node to front
    // selectedNode.raise();
  }
}

// Added: Helper function to get status class (should be placed after ticked, before or after getNodeColor)
function getStatusClass(status) {
  return status ? status.replace(/_/g, "-") : "unknown"; // Replace all underscores
}

// Function: Enable node dragging (unchanged)
// ... drag ...
