(() => {
  const client = window.verdelleSupabase;
  const plantsGrid = document.getElementById("plants");
  const accessoriesGrid = document.getElementById("pots");
  const categoriesElement = document.getElementById("plant-categories");
  const dialog = document.getElementById("shop-dialog");
  const dialogTitle = document.getElementById("dialog-title");
  const dialogBody = document.getElementById("dialog-body");
  const cartCount = document.getElementById("cart");
  const favoritesCount = document.getElementById("favorites-count");
  const products = new Map();
  const cart = new Map();
  const favorites = new Set();
  let currentUser = null;

  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

  const showMessage = (element, message, isError = false) => {
    element.innerHTML = `<p class="empty-state"${isError ? ' role="alert"' : ' role="status"'}>${escapeHtml(message)}</p>`;
  };

  const updateCounts = () => {
    cartCount.textContent = [...cart.values()].reduce((sum, item) => sum + item.quantity, 0);
    favoritesCount.textContent = favorites.size;
  };

  const openDialog = (title, content) => {
    dialogTitle.textContent = title;
    dialogBody.innerHTML = content;
    if (!dialog.open) dialog.showModal();
  };

  const renderProduct = product => {
    const isPlant = product.kind === "plant";
    const card = `<div class="card" data-product-id="${escapeHtml(product.id)}">
      <span class="tag">${escapeHtml(product.name)}</span>
      <img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy" role="button" tabindex="0" aria-label="View larger image of ${escapeHtml(product.name)}">
      <div class="price"><span>$${Number(product.price).toFixed(2)}</span><span class="product-actions">
        <button class="favorite-toggle${favorites.has(product.id) ? " is-favorite" : ""}" type="button" aria-label="${favorites.has(product.id) ? "Remove" : "Add"} ${escapeHtml(product.name)} ${favorites.has(product.id) ? "from" : "to"} liked products" aria-pressed="${favorites.has(product.id)}">♡</button>
        <button class="a" type="button" aria-label="Add ${escapeHtml(product.name)} to cart">🛍</button>
      </span></div>
    </div>`;
    products.set(product.id, product);
    return card;
  };

  const renderCatalog = productList => {
    const plants = productList.filter(product => product.kind === "plant");
    const accessories = productList.filter(product => product.kind === "accessory");
    plantsGrid.innerHTML = plants.length ? plants.map(renderProduct).join("") : '<p class="empty-state">No plants are currently available.</p>';
    accessoriesGrid.innerHTML = accessories.length ? accessories.map(renderProduct).join("") : '<p class="empty-state">No accessories are currently available.</p>';
  };

  const renderCategories = categories => {
    if (!categories.length) {
      showMessage(categoriesElement, "No plant categories are available yet.");
      return;
    }
    categoriesElement.innerHTML = categories.map(category => `<details>
      <summary>${escapeHtml(category.name)}<span aria-hidden="true">+</span></summary>
      <p>${escapeHtml(category.description)}</p>
    </details>`).join("");
  };

  const refreshFavorites = async () => {
    favorites.clear();
    if (currentUser) {
      const { data, error } = await client.from("favorites").select("product_id");
      if (error) throw error;
      data.forEach(item => favorites.add(item.product_id));
    }
    document.querySelectorAll(".favorite-toggle").forEach(button => {
      const productId = button.closest("[data-product-id]").dataset.productId;
      const saved = favorites.has(productId);
      button.classList.toggle("is-favorite", saved);
      button.setAttribute("aria-pressed", String(saved));
      button.setAttribute("aria-label", `${saved ? "Remove" : "Add"} ${products.get(productId).name} ${saved ? "from" : "to"} liked products`);
    });
    updateCounts();
  };

  const loadShop = async () => {
    try {
      const [categoryResult, productResult] = await Promise.all([
        client.from("plant_categories").select("id,name,description,sort_order").eq("active", true).order("sort_order"),
        client.from("products").select("id,name,category_id,kind,price,stock,image_url,description,light,watering").eq("status", "available").gt("stock", 0).order("created_at", { ascending: false })
      ]);
      if (categoryResult.error) throw new Error(`Could not load plant categories: ${categoryResult.error.message}`);
      if (productResult.error) throw new Error(`Could not load products: ${productResult.error.message}`);
      renderCategories(categoryResult.data);
      renderCatalog(productResult.data);
      if (currentUser) await refreshFavorites();
    } catch (error) {
      console.error("Unable to load the Verdelle shop.", error);
      showMessage(plantsGrid, `The plant catalog could not be loaded. ${error.message}`, true);
      showMessage(accessoriesGrid, `The accessory catalog could not be loaded. ${error.message}`, true);
      showMessage(categoriesElement, `Plant categories could not be loaded. ${error.message}`, true);
    }
  };

  const updateProductFavorite = async productId => {
    if (!currentUser) {
      renderAccount("signin", "Sign in to save liked products to your account.");
      return;
    }
    try {
      const isSaved = favorites.has(productId);
      const result = isSaved
        ? await client.from("favorites").delete().eq("product_id", productId)
        : await client.from("favorites").insert({ user_id: currentUser.id, product_id: productId });
      if (result.error) throw result.error;
      await refreshFavorites();
    } catch (error) {
      console.error("Unable to update liked products.", error);
      openDialog("Liked products", `<p class="account-status" role="alert">Your liked products could not be updated. ${escapeHtml(error.message)}</p>`);
    }
  };

  const renderCart = () => {
    const items = [...cart.values()];
    if (!items.length) {
      openDialog("Your shop bag", '<p class="empty-state">Your bag is empty. Explore the collection and add something you love.</p>');
      return;
    }
    const total = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    openDialog("Your shop bag", `<div class="dialog-list">${items.map(item => `<div class="dialog-product">
      <img src="${escapeHtml(item.image_url)}" alt="">
      <div><strong>${escapeHtml(item.name)}</strong><small>$${Number(item.price).toFixed(2)} · Qty ${item.quantity}</small></div>
      <button type="button" data-remove-cart="${escapeHtml(item.id)}">Remove</button>
    </div>`).join("")}</div><div class="dialog-total"><span>Subtotal</span><span>$${total.toFixed(2)}</span></div><p class="account-note">Checkout is not connected yet.</p>`);
  };

  const renderFavorites = () => {
    if (!currentUser) {
      openDialog("Liked products", '<p class="empty-state">Sign in to save and view your liked products.</p>');
      return;
    }
    const items = [...favorites].map(id => products.get(id)).filter(Boolean);
    if (!items.length) {
      openDialog("Liked products", '<p class="empty-state">You have not liked any products yet. Tap the heart on a product to save it here.</p>');
      return;
    }
    openDialog("Liked products", `<div class="dialog-list">${items.map(item => `<div class="dialog-product">
      <img src="${escapeHtml(item.image_url)}" alt="">
      <div><strong>${escapeHtml(item.name)}</strong><small>$${Number(item.price).toFixed(2)}</small></div>
      <button type="button" data-remove-favorite="${escapeHtml(item.id)}">Remove</button>
    </div>`).join("")}</div>`);
  };

  const renderAccount = (mode = "signin", status = "") => {
    const signup = mode === "signup";
    if (currentUser) {
      openDialog("Your Verdelle account", `<p>Signed in as <strong>${escapeHtml(currentUser.email || "your account")}</strong>.</p>
        ${status ? `<p class="account-status" role="status">${escapeHtml(status)}</p>` : ""}
        <button class="dialog-action" type="button" data-signout>Sign out</button>`);
      return;
    }
    openDialog(signup ? "Create an account" : "Welcome back", `<form class="account-form" id="account-form" data-mode="${signup ? "signup" : "signin"}">
      ${signup ? '<label>Your name<input name="name" autocomplete="name" required></label>' : ""}
      <label>Email address<input name="email" type="email" autocomplete="email" required></label>
      <label>Password<input name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" required></label>
      <button class="dialog-action" type="submit">${signup ? "Sign up" : "Sign in"}</button>
      <p class="account-note">Your account and liked products are securely stored with Verdelle.</p>
      ${status ? `<p class="account-status" role="status">${escapeHtml(status)}</p>` : ""}
    </form><p class="account-switch">${signup ? "Already have an account?" : "New to Verdelle?"}
      <button type="button" data-account-mode="${signup ? "signin" : "signup"}">${signup ? "Sign in" : "Create an account"}</button>
    </p>`);
  };

  const showImage = image => {
    const viewer = document.getElementById("image-viewer");
    const viewerImage = document.getElementById("image-viewer-image");
    const viewerTitle = document.getElementById("image-viewer-title");
    viewerImage.src = image.src;
    viewerImage.alt = image.alt;
    viewerTitle.textContent = `Larger view: ${image.alt}`;
    viewer.hidden = false;
    viewer.querySelector(".image-viewer-back").focus();
  };

  document.getElementById("product-search").addEventListener("input", event => {
    const query = event.target.value.trim().toLocaleLowerCase();
    document.querySelectorAll("#plants .card,#pots .card").forEach(card => {
      card.hidden = !card.querySelector(".tag").textContent.toLocaleLowerCase().includes(query);
    });
  });

  document.addEventListener("click", async event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("#favorites-open")) {
      renderFavorites();
      return;
    }
    if (target.closest("#account-open")) {
      renderAccount();
      return;
    }
    if (target.closest("#cart-open")) {
      renderCart();
      return;
    }
    if (target.closest(".dialog-close") || target === dialog || target.id === "image-viewer") {
      if (dialog.open) dialog.close();
      document.getElementById("image-viewer").hidden = true;
      return;
    }
    const backButton = target.closest(".image-viewer-back");
    if (backButton) {
      document.getElementById("image-viewer").hidden = true;
      return;
    }
    const image = target.closest(".grid#plants .card img,.grid#pots .card img");
    if (image) {
      showImage(image);
      return;
    }
    const favoriteButton = target.closest(".favorite-toggle");
    if (favoriteButton) {
      await updateProductFavorite(favoriteButton.closest("[data-product-id]").dataset.productId);
      return;
    }
    const addButton = target.closest(".a");
    if (addButton) {
      const product = products.get(addButton.closest("[data-product-id]").dataset.productId);
      if (product) {
        const existing = cart.get(product.id);
        cart.set(product.id, { ...product, quantity: (existing?.quantity || 0) + 1 });
        updateCounts();
      }
      return;
    }
    const accountModeButton = target.closest("[data-account-mode]");
    if (accountModeButton) {
      renderAccount(accountModeButton.dataset.accountMode);
      return;
    }
    const removeFavorite = target.closest("[data-remove-favorite]");
    if (removeFavorite) {
      await updateProductFavorite(removeFavorite.dataset.removeFavorite);
      renderFavorites();
      return;
    }
    const removeCart = target.closest("[data-remove-cart]");
    if (removeCart) {
      cart.delete(removeCart.dataset.removeCart);
      updateCounts();
      renderCart();
      return;
    }
    if (target.closest("[data-signout]")) {
      try {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        currentUser = null;
        favorites.clear();
        updateCounts();
        renderAccount("signin", "You have signed out.");
      } catch (error) {
        renderAccount("signin", `Sign out failed. ${error.message}`);
      }
    }
  });

  document.addEventListener("keydown", event => {
    const target = event.target;
    if ((event.key === "Enter" || event.key === " ") && target instanceof HTMLImageElement && target.matches(".grid#plants .card img,.grid#pots .card img")) {
      event.preventDefault();
      showImage(target);
      return;
    }
    if (event.key === "Escape") document.getElementById("image-viewer").hidden = true;
  });

  dialog.addEventListener("submit", async event => {
    if (!(event.target instanceof HTMLFormElement) || event.target.id !== "account-form") return;
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const mode = form.dataset.mode;
    const credentials = {
      email: String(formData.get("email")),
      password: String(formData.get("password"))
    };
    try {
      const result = mode === "signup"
        ? await client.auth.signUp({ ...credentials, options: { data: { name: String(formData.get("name")) } } })
        : await client.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        renderAccount("signin", "Check your email to confirm your account, then sign in.");
        return;
      }
      currentUser = result.data.user;
      await refreshFavorites();
      renderAccount("signin", "You are signed in.");
    } catch (error) {
      renderAccount(mode, error.message);
    }
  });

  const initialize = async () => {
    if (!client) {
      const message = "The shop could not connect to Supabase. Check that the Supabase scripts loaded and that this site is served over HTTP or HTTPS.";
      showMessage(plantsGrid, message, true);
      showMessage(accessoriesGrid, message, true);
      showMessage(categoriesElement, message, true);
      console.error(message);
      return;
    }
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error("Unable to restore the Supabase session.", error);
      renderAccount("signin", `Your session could not be restored. ${error.message}`);
    } else {
      currentUser = data.session?.user || null;
    }
    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      window.setTimeout(() => refreshFavorites().catch(error => {
        console.error("Unable to refresh liked products.", error);
      }), 0);
    });
    await loadShop();
  };

  showMessage(plantsGrid, "Loading plants…");
  showMessage(accessoriesGrid, "Loading accessories…");
  initialize().catch(error => {
    console.error("Unable to initialize the Verdelle shop.", error);
    showMessage(plantsGrid, `The shop could not be initialized. ${error.message}`, true);
    showMessage(accessoriesGrid, `The shop could not be initialized. ${error.message}`, true);
    showMessage(categoriesElement, `The shop could not be initialized. ${error.message}`, true);
  });
})();
