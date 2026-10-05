create table if not exists public.plant_categories (
  id text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_verdelle_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_verdelle_admin() from public;
grant execute on function public.is_verdelle_admin() to authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category_id text not null references public.plant_categories(id) on update cascade,
  kind text not null default 'plant' check (kind in ('plant', 'accessory')),
  price numeric(10, 2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  light text not null default '',
  watering text not null default '',
  image_url text not null default '',
  image_path text,
  description text not null default '',
  status text not null default 'available' check (status in ('available', 'unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_status_kind_idx on public.products(status, kind);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

insert into public.plant_categories (id, name, description, sort_order)
values
  ('tropical-aroids', 'Tropical & Aroids', 'Monstera, Philodendron, Anthurium and Alocasia — bold, glossy foliage for bright indoor spaces.', 1),
  ('flowering-plants', 'Flowering Plants', 'Orchids, peace lilies and anthurium blooms that bring hot-pink colour to any room.', 2),
  ('rare-collectible', 'Rare & Collectible', 'Variegated and limited varieties, hand-picked and regularly updated.', 3),
  ('pots-planters', 'Pots & Planters', 'Ceramic, terracotta and sculptural pots, plus soil mixes and plant supports.', 4)
on conflict (id) do nothing;

insert into public.products
  (slug, name, category_id, kind, price, stock, image_url, description)
values
  ('philodendron-pink-princess', 'Philodendron Pink Princess', 'rare-collectible', 'plant', 42.00, 3, 'https://i.pinimg.com/736x/ad/ce/f0/adcef0858388dee54477b9c21e7cfd84.jpg', 'A striking philodendron with deep green leaves and vivid pink variegation.'),
  ('monstera-albo-variegata', 'Monstera Albo Variegata', 'rare-collectible', 'plant', 89.00, 3, 'https://i.pinimg.com/1200x/ce/bc/99/cebc99e43844f31ec1750d1351229e6d.jpg', 'A collectible climbing Monstera with distinctive white variegation.'),
  ('anthurium-clarinervium', 'Anthurium Clarinervium', 'tropical-aroids', 'plant', 54.00, 3, 'https://i.pinimg.com/736x/38/09/3f/38093f2100f1ca9df83996f2fcfeef90.jpg', 'A velvet-leaf Anthurium with dramatic pale veining.'),
  ('forma-01-ceramic-pot', 'Forma 01 Ceramic Pot', 'pots-planters', 'accessory', 29.90, 3, 'https://i.pinimg.com/1200x/4e/71/71/4e71714c8f6b08baf9b9179d58252c42.jpg', 'A sculptural ceramic pot for a considered plant display.'),
  ('terracurve-planter', 'Terracurve Planter', 'pots-planters', 'accessory', 39.90, 3, 'https://i.pinimg.com/1200x/eb/9c/29/eb9c2968a576be40bdfbcb742677cce9.jpg', 'A softly curved planter for indoor greenery.'),
  ('moss-pole-support', 'Moss Pole Support', 'pots-planters', 'accessory', 14.90, 3, 'https://i.pinimg.com/1200x/0c/51/61/0c5161425abd6b4d9c7eed0d6d2b5ca4.jpg', 'A climbing support for aroids and other vining plants.'),
  ('aroid-mix-soil-3l', 'Aroid Mix Soil, 3 L', 'pots-planters', 'accessory', 10.90, 3, 'https://i.pinimg.com/1200x/e3/1c/72/e31c72a41d72da96f4b9e786756e3605.jpg', 'A chunky, airy soil mix prepared for aroids.')
on conflict (slug) do nothing;

alter table public.plant_categories enable row level security;
alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "Active plant categories are public" on public.plant_categories;
create policy "Active plant categories are public"
on public.plant_categories for select
to anon, authenticated
using (active or (select public.is_verdelle_admin()));

drop policy if exists "Admins manage plant categories" on public.plant_categories;
create policy "Admins manage plant categories"
on public.plant_categories for all
to authenticated
using ((select public.is_verdelle_admin()))
with check ((select public.is_verdelle_admin()));

drop policy if exists "Admins can read admin assignments" on public.admin_users;
create policy "Admins can read admin assignments"
on public.admin_users for select
to authenticated
using ((select public.is_verdelle_admin()));

drop policy if exists "Available products are public" on public.products;
create policy "Available products are public"
on public.products for select
to anon, authenticated
using ((status = 'available' and stock > 0) or (select public.is_verdelle_admin()));

drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
on public.products for all
to authenticated
using ((select public.is_verdelle_admin()))
with check ((select public.is_verdelle_admin()));

drop policy if exists "Users read their own favorites" on public.favorites;
create policy "Users read their own favorites"
on public.favorites for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users save their own favorites" on public.favorites;
create policy "Users save their own favorites"
on public.favorites for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users remove their own favorites" on public.favorites;
create policy "Users remove their own favorites"
on public.favorites for delete
to authenticated
using (user_id = (select auth.uid()));

grant select on public.plant_categories, public.products to anon, authenticated;
grant insert, update, delete on public.plant_categories, public.products to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, delete on public.favorites to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

drop policy if exists "Product images are public" on storage.objects;
create policy "Product images are public"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images' and (select public.is_verdelle_admin()));

drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and (select public.is_verdelle_admin()))
with check (bucket_id = 'product-images' and (select public.is_verdelle_admin()));

drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and (select public.is_verdelle_admin()));
