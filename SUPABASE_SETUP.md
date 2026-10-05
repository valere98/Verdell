# Verdelle Supabase setup

The shop uses the Supabase publishable key in browser code. This key is designed
to be public; database access is protected by the migration's row-level security
policies. Never place a database password or `service_role`/secret key in these
files.

## 1. Apply the database migration

From the project directory, with the Supabase CLI installed and authenticated.
The `supabase/migrations` folder is already present; run `supabase init` only if
the CLI reports that the local project has not been initialized (it should add
`supabase/config.toml` without replacing the migration):

```powershell
supabase login
supabase init
supabase link --project-ref tqbxmeacyoxsqfjhuqar
supabase db push
```

The schema and starter catalog are in
`supabase/migrations/20261005160000_verdelle_shop.sql`.
The storefront loads its products and plant-finder categories from this schema.
The migration must be applied before the live catalog, account, favorites, or
admin features can work; connection errors are shown in the page rather than
replaced with a hard-coded catalog.

## 2. Create the first administrator

1. Apply the database migration and serve the project through a local web server
   or deploy it to a website. Do not open the HTML using a `file://` URL;
   Supabase auth requires an HTTP(S) origin.
2. Create an account from the storefront's account control, then sign in to the
   Supabase dashboard and copy that user's UUID from **Authentication → Users**.
3. In the Supabase SQL editor, grant that UUID admin access:

   ```sql
   insert into public.admin_users (user_id)
   values ('PASTE-AUTH-USER-UUID-HERE');
   ```

4. Sign in at `admin.html`. Admin access is controlled by the `admin_users`
   table; users cannot grant admin access to themselves from the browser. The
   dashboard can add, edit, and delete products and edit/add the categories
   shown in **Find your plant**. Product images are uploaded to the public-read
   `product-images` bucket; uploads are limited to 5 MB and JPEG, PNG, WebP, or
   AVIF files.

## 3. Deploy

Publish the project files, including `assets/supabase-client.js`,
`assets/storefront.js`, `assets/admin.js`, `admin.html`, and the `assets/` media
directory, to the same site. Configure the site's canonical URL and allowed
redirect URLs in **Authentication → URL Configuration** before enabling email
confirmation or password recovery.

The cart is currently a local preview only. Payment processing, order storage,
and fulfilment are not configured; add a payment provider and server-side order
validation before accepting real payments.
