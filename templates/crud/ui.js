// CRUD template UI. Rename the api() argument to match manifest.id, then
// adapt the markup and fields to the app's real data model.

const api = window.charming.api('my-app');

let items = [];

async function refresh() {
  items = await api.list({});
  render();
}

function render() {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="min-h-screen bg-stone-50">
      <header class="sticky top-0 bg-stone-50/90 backdrop-blur border-b border-stone-200 px-6 py-4">
        <h1 class="text-lg font-semibold text-stone-900">My App</h1>
        <p class="text-sm text-stone-500">${items.length} item${items.length === 1 ? '' : 's'}</p>
      </header>
      <main class="px-6 py-6 max-w-2xl mx-auto">
        <form id="add-form" class="flex gap-2 mb-6">
          <input
            id="add-input"
            type="text"
            placeholder="Add an item"
            class="flex-1 rounded-md border border-stone-200 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            class="rounded-md bg-sky-600 text-white text-sm font-semibold px-4 py-2"
          >
            Add
          </button>
        </form>
        <ul class="space-y-2">
          ${items
            .map(
              (item) => `
            <li
              data-id="${item.id}"
              class="flex items-center gap-3 bg-white border border-stone-200 rounded-md px-4 py-3"
            >
              <input type="checkbox" class="toggle" ${item.done ? 'checked' : ''} />
              <span class="flex-1 text-sm ${item.done ? 'line-through text-stone-400' : 'text-stone-900'}">
                ${item.text}
              </span>
              <button class="remove text-sm text-stone-400 hover:text-red-600">Remove</button>
            </li>
          `,
            )
            .join('')}
        </ul>
      </main>
      <div id="toast" class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-sm rounded-md px-4 py-2 flex items-center gap-3"></div>
    </div>
  `;
  bind();
}

function bind() {
  const app = document.querySelector('#app');

  app.querySelector('#add-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = app.querySelector('#add-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await api.add({ text });
    await refresh();
  });

  app.querySelectorAll('li').forEach((row) => {
    const id = row.dataset.id;

    row.querySelector('.toggle').addEventListener('change', async () => {
      await api.toggle({ id });
      await refresh();
    });

    row.querySelector('.remove').addEventListener('click', async () => {
      const removed = items.find((item) => item.id === id);
      items = items.filter((item) => item.id !== id);
      render();
      await api.remove({ id });
      showUndoToast(removed);
    });
  });
}

function showUndoToast(removedItem) {
  const toast = document.querySelector('#toast');
  toast.innerHTML = `
    <span>Removed</span>
    <button class="font-semibold underline" id="undo">Undo</button>
  `;
  toast.classList.remove('hidden');

  toast.querySelector('#undo').addEventListener('click', async () => {
    toast.classList.add('hidden');
    await api.restore({ item: removedItem });
    await refresh();
  });

  setTimeout(() => toast.classList.add('hidden'), 6000);
}

refresh();

// Live updates when another surface (or agent) changes the data.
window.charming.onStateChange?.(() => refresh());
setInterval(refresh, 4000);
