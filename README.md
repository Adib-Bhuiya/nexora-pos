# NEXORA POS

A modern, responsive, and secure single-store retail Point of Sale (POS) system built for seamless store operations, catalog management, inventory tracking, and sales analytics.

## Live Demo

🔗 **Live Demo:** [Demo Link](https://nexora-pos-blue.vercel.app/)

---

## What It Does

Nexora POS provides store owners and cashiers with a complete suite of retail management tools:

- **Point of Sale & Register Checkout**
  - Fast checkout workflow optimized for desktop, tablet, and mobile registers.
  - Barcode scanner support with quick-add shortcuts (`/` for search, Enter on barcode scan).
  - Flexible cart adjustments, live inventory stock validation, custom discounts (fixed or percentage), and configurable tax calculation.
  - Cash tendered and change calculation with instant quick-tender suggestions.
  - Digital receipt generation and thermal printer support (58mm / 80mm).

- **Product Catalog Management**
  - Add, edit, and delete store items with categorized listings, SKUs, and barcodes.
  - Dual-mode product images: direct image upload via Cloudinary or custom image URLs.
  - Visual color tones and graceful fallback thumbnails for every item.

- **Inventory & Stock Control**
  - Real-time stock level monitoring with configurable low-stock warnings.
  - Fast restock and manual stock adjustment with documented reason notes.
  - Full audit trail of stock movements (initial stock, sales, restocks, adjustments, and catalog removals).

- **Sales History & Refunds**
  - Comprehensive transaction logs with payment method filters and flexible date range presets.
  - Detailed receipt inspection and full or itemized sale refunds.
  - One-click CSV export for offline accounting.

- **Analytics & Reporting**
  - Visual charts showing revenue trends, profit margins, and best-selling items.
  - Payment method breakdowns and overall inventory valuation summaries.

- **Role-Based Authentication & Staff Security**
  - Two distinct roles: **Store Owner** (full administration) and **Cashier** (register operations).
  - Secure owner password login and cashier numeric PIN authentication with automatic brute-force lockout protection.
  - Account recovery via secure email password reset links.
  - Owner-managed cashier PIN resets and credential management.
  - Clean session revocation and sign-out controls.

---

## Tech Stack & Tools

- **Languages:** TypeScript, JavaScript, HTML5, CSS3
- **Framework:** Next.js (App Router)
- **UI & Components:** React 19, Lucide React (Icons), Recharts (Data Visualization)
- **Styling:** Tailwind CSS v4
- **Database & Data Modeling:** MongoDB, Mongoose
- **Authentication & Security:** bcryptjs (password and PIN hashing), HTTP-only cookie sessions, CSRF & Origin validation
- **Image Hosting:** Cloudinary REST API (signed image uploads)
- **Email Service:** Resend API (transactional password recovery emails)
- **Testing & Tooling:** Vitest, TypeScript (`tsc`)
