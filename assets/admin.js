(() => {
  const client = window.verdelleSupabase;
  const authPanel = document.getElementById("auth-panel");
  const dashboard = document.getElementById("dashboard");
  const authNotice = document.getElementById("auth-notice");
  const productNotice = document.getElementById("product-notice");
  const categoryNotice = document.getElementById("category-notice");
  const productForm = document.getElementById("product-form");
  const categoryForm = document.getElementById("category-form");
  const productList = document.getElementById("product-list");
  const categoryList = document.getElementById("category-list");
  const categoriesSelect = productForm.elements.namedItem("category_id");
  const products = new Map();
  const categories = new Map();

  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

  const setNotice = (element, message, isError = false) => {
    element.textContent = message;
    element.classList.toggle("error", isError);
    element.hidden = !message;
  };

  const setSignedOut = () => {
    dashboard.hidden = true;
    authPanel.hidden = false;
  };

  const setSignedIn = user => {
    authPanel.hidden = true;
    dashboard.hidden = false;
    document.getElementById("signed-in-as").textContent = user.email || "Administrator";
  };

  const slugify = value => value.normalize("NFKD").toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const loadCategories = async () => {
    const { data, error } = await client.from("plant_categories")
      .select("id,name,description,sort_order,active")
      .order("sort_order");
    if (error) throw error;
    categories.clear();
    data.forEach(category => categories.set(category.id, category));
    categoriesSelect.innerHTML = data.map(category =>
      `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}${category.active ? "" : " (hidden)"}</option>`
    ).join("");
    categoryList.innerHTML = data.length ? data.map(category => `<div class="category-row">
      <div><strong>${escapeHtml(category.name)}${category.active ? "" : " · Hidden"}</strong><p>${escapeHtml(category.description || "")}</p></div>
      <button class="secondary" type="button" data-edit-category="${escapeHtml(category.id)}">Edit</button>
    </div>`).join("") : '<p class="muted">No categories have been created yet.</p>';
  };

  const loadProducts = async () => {
    const { data, error } = await client.from("products")
      .select("id,slug,name,category_id,kind,price,stock,light,watering,image_url,image_path,description,status")
      .order("created_at", { ascending: false });
    if (error) throw error;
    products.clear();
    data.forEach(product => products.set(product.id, product));
    productList.innerHTML = data.length ? data.map(product => `<article class="product-row">
      <img src="${escapeHtml(product.image_url || "")}" alt="">
      <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(categories.get(product.category_id)?.name || product.category_id)} · ${product.kind} · $${Number(product.price).toFixed(2)} · Stock ${product.stock} · ${escapeHtml(product.status)}</small></div>
      <div class="actions"><button class="secondary" type="button" data-edit-product="${escapeHtml(product.id)}">Edit</button><button class="danger" type="button" data-delete-product="${escapeHtml(product.id)}">Delete</button></div>
    </article>`).join("") : '<p class="muted">No products yet. Add the first one using the form above.</p>';
  };

  const refreshDashboard = async () => {
    try {
      await loadCategories();
      await loadProducts();
    } catch (error) {
      console.error("Unable to load the admin dashboard.", error);
      setNotice(productNotice, `Dashboard data could not be loaded. ${error.message}`, true);
    }
  };

  const checkAdmin = async user => {
    const { data, error } = await client.from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      setSignedOut();
      setNotice(authNotice, "This account is not authorized to manage the Verdelle shop.", true);
      return;
    }
    setSignedIn(user);
    await refreshDashboard();
  };

  const resetProductForm = () => {
    productForm.reset();
    productForm.elements.namedItem("id").value = "";
    productForm.elements.namedItem("stock").value = "0";
    productForm.elements.namedItem("status").value = "available";
    productForm.elements.namedItem("image").required = false;
    productForm.querySelector("button[type=submit]").textContent = "Save product";
    document.getElementById("cancel-edit").hidden = true;
  };

  const editProduct = product => {
    productForm.elements.namedItem("id").value = product.id;
    productForm.elements.namedItem("name").value = product.name;
    productForm.elements.namedItem("category_id").value = product.category_id;
    productForm.elements.namedItem("kind").value = product.kind;
    productForm.elements.namedItem("price").value = product.price;
    productForm.elements.namedItem("stock").value = product.stock;
    productForm.elements.namedItem("light").value = product.light || "";
    productForm.elements.namedItem("watering").value = product.watering || "";
    productForm.elements.namedItem("description").value = product.description || "";
    productForm.elements.namedItem("status").value = product.status;
    productForm.elements.namedItem("image").required = !product.image_url;
    productForm.querySelector("button[type=submit]").textContent = "Update product";
    document.getElementById("cancel-edit").hidden = false;
    productForm.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  productForm.addEventListener("submit", async event => {
    event.preventDefault();
    setNotice(productNotice, "");
    const submit = productForm.querySelector("button[type=submit]");
    submit.disabled = true;
    let uploadedPath = null;
    try {
      const fields = new FormData(productForm);
      const id = String(fields.get("id") || "");
      const oldProduct = id ? products.get(id) : null;
      const file = fields.get("image");
      let imagePath = oldProduct?.image_path || null;
      let imageUrl = oldProduct?.image_url || "";

      if (file instanceof File && file.size > 0) {
        if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
        if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
          throw new Error("Use a JPEG, PNG, WebP, or AVIF image.");
        }
        const extension = file.name.split(".").pop().toLocaleLowerCase();
        uploadedPath = `${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from("product-images").upload(uploadedPath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false
        });
        if (uploadError) throw uploadError;
        imagePath = uploadedPath;
        imageUrl = client.storage.from("product-images").getPublicUrl(uploadedPath).data.publicUrl;
      }

      const name = String(fields.get("name")).trim();
      if (!oldProduct && !imageUrl) throw new Error("Upload a product image before saving.");
      const product = {
        slug: oldProduct?.slug || `${slugify(name) || "product"}-${crypto.randomUUID().slice(0, 8)}`,
        name,
        category_id: String(fields.get("category_id")),
        kind: String(fields.get("kind")),
        price: Number(fields.get("price")),
        stock: Number(fields.get("stock")),
        light: String(fields.get("light") || "").trim(),
        watering: String(fields.get("watering") || "").trim(),
        image_url: imageUrl,
        image_path: imagePath,
        description: String(fields.get("description") || "").trim(),
        status: String(fields.get("status")),
        updated_at: new Date().toISOString()
      };
      const result = oldProduct
        ? await client.from("products").update(product).eq("id", id)
        : await client.from("products").insert(product);
      if (result.error) throw result.error;
      resetProductForm();
      let successMessage = oldProduct ? "Product updated." : "Product added.";
      if (uploadedPath && oldProduct?.image_path) {
        const { error: cleanupError } = await client.storage.from("product-images").remove([oldProduct.image_path]);
        if (cleanupError) {
          console.error("Unable to remove the replaced product image.", cleanupError);
          successMessage = `Product saved, but the previous image could not be removed. ${cleanupError.message}`;
        }
      }
      setNotice(productNotice, successMessage);
      await refreshDashboard();
    } catch (error) {
      console.error("Unable to save product.", error);
      if (uploadedPath) {
        const { error: cleanupError } = await client.storage.from("product-images").remove([uploadedPath]);
        if (cleanupError) console.error("Unable to remove the unused uploaded image.", cleanupError);
      }
      setNotice(productNotice, `Product could not be saved. ${error.message}`, true);
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById("cancel-edit").addEventListener("click", resetProductForm);

  productList.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;
    const editId = button.dataset.editProduct;
    if (editId) {
      const product = products.get(editId);
      if (product) editProduct(product);
      return;
    }
    const deleteId = button.dataset.deleteProduct;
    if (!deleteId) return;
    const product = products.get(deleteId);
    if (!product || !window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    button.disabled = true;
    try {
      const { error } = await client.from("products").delete().eq("id", deleteId);
      if (error) throw error;
    } catch (error) {
      console.error("Unable to delete product.", error);
      setNotice(productNotice, `Product could not be deleted. ${error.message}`, true);
      button.disabled = false;
      return;
    }
    if (product.image_path) {
      const { error: imageError } = await client.storage.from("product-images").remove([product.image_path]);
      if (imageError) {
        console.error("Unable to remove the deleted product's image.", imageError);
        setNotice(productNotice, `Product deleted, but its image could not be removed. ${imageError.message}`, true);
      } else {
        setNotice(productNotice, "Product deleted.");
      }
    } else {
      setNotice(productNotice, "Product deleted.");
    }
    if (productForm.elements.namedItem("id").value === deleteId) resetProductForm();
    await refreshDashboard();
  });

  const resetCategoryForm = () => {
    categoryForm.reset();
    categoryForm.elements.namedItem("original_id").value = "";
    categoryForm.elements.namedItem("sort_order").value = "1";
    categoryForm.elements.namedItem("id").disabled = false;
    categoryForm.querySelector("button[type=submit]").textContent = "Save category";
    document.getElementById("cancel-category-edit").hidden = true;
  };

  categoryList.addEventListener("click", event => {
    const button = event.target.closest("[data-edit-category]");
    if (!button) return;
    const category = categories.get(button.dataset.editCategory);
    if (!category) return;
    categoryForm.elements.namedItem("original_id").value = category.id;
    categoryForm.elements.namedItem("id").value = category.id;
    categoryForm.elements.namedItem("id").disabled = true;
    categoryForm.elements.namedItem("name").value = category.name;
    categoryForm.elements.namedItem("description").value = category.description || "";
    categoryForm.elements.namedItem("sort_order").value = category.sort_order;
    categoryForm.elements.namedItem("active").checked = category.active;
    categoryForm.querySelector("button[type=submit]").textContent = "Update category";
    document.getElementById("cancel-category-edit").hidden = false;
    categoryForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("cancel-category-edit").addEventListener("click", resetCategoryForm);

  categoryForm.addEventListener("submit", async event => {
    event.preventDefault();
    setNotice(categoryNotice, "");
    const submit = categoryForm.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const fields = new FormData(categoryForm);
      const originalId = String(fields.get("original_id") || "");
      const category = {
        id: originalId || String(fields.get("id") || "").trim(),
        name: String(fields.get("name") || "").trim(),
        description: String(fields.get("description") || "").trim(),
        sort_order: Number(fields.get("sort_order")),
        active: categoryForm.elements.namedItem("active").checked,
        updated_at: new Date().toISOString()
      };
      const result = originalId
        ? await client.from("plant_categories").update(category).eq("id", originalId)
        : await client.from("plant_categories").insert(category);
      if (result.error) throw result.error;
      resetCategoryForm();
      setNotice(categoryNotice, originalId ? "Category updated." : "Category added.");
      await refreshDashboard();
    } catch (error) {
      console.error("Unable to save category.", error);
      setNotice(categoryNotice, `Category could not be saved. ${error.message}`, true);
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById("auth-form").addEventListener("submit", async event => {
    event.preventDefault();
    setNotice(authNotice, "");
    const fields = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: String(fields.get("email")),
        password: String(fields.get("password"))
      });
      if (error) throw error;
      await checkAdmin(data.user);
    } catch (error) {
      console.error("Administrator sign in failed.", error);
      setNotice(authNotice, `Sign in failed. ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("signout").addEventListener("click", async () => {
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setSignedOut();
      setNotice(authNotice, "You have signed out.");
    } catch (error) {
      setNotice(productNotice, `Sign out failed. ${error.message}`, true);
    }
  });

  const initialize = async () => {
    if (!client) {
      setNotice(authNotice, "Supabase did not load. Check the Supabase scripts and serve this site over HTTP or HTTPS.", true);
      return;
    }
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error("Unable to restore the administrator session.", error);
      setNotice(authNotice, `Your session could not be restored. ${error.message}`, true);
      return;
    }
    if (!data.session?.user) return;
    try {
      await checkAdmin(data.session.user);
    } catch (checkError) {
      console.error("Unable to verify administrator access.", checkError);
      setSignedOut();
      setNotice(authNotice, `Administrator access could not be verified. ${checkError.message}`, true);
    }
  };

  initialize().catch(error => {
    console.error("Unable to initialize the admin dashboard.", error);
    setNotice(authNotice, `The admin dashboard could not start. ${error.message}`, true);
  });
})();
