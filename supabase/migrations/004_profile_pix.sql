-- =====================================================================
-- Pix no perfil: a chave e a imagem do QR Code passam a ser dados do
-- usuário (Minha empresa), em vez de um arquivo fixo dentro do site.
-- A imagem é guardada como data URL, já reduzida pelo app.
-- =====================================================================

alter table public.profiles
  add column if not exists pix_key text,
  add column if not exists pix_qr_image text;

alter table public.profiles drop constraint if exists profiles_pix_qr_image_check;
alter table public.profiles
  add constraint profiles_pix_qr_image_check
  check (pix_qr_image is null or (pix_qr_image like 'data:image/%' and length(pix_qr_image) < 400000));

alter table public.profiles drop constraint if exists profiles_pix_key_check;
alter table public.profiles
  add constraint profiles_pix_key_check
  check (pix_key is null or length(pix_key) <= 140);
