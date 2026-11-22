import { Bell, DollarSign, Gift, Image, LayoutDashboard, Receipt, Settings, TrendingUp, Trophy, Users, Wallet } from "lucide-react";

export const adminSections = [
  { slug: "", label: "Dashboard", icon: LayoutDashboard },
  { slug: "users", label: "Users", icon: Users, columns: ["Name", "Email", "Phone", "Status", "Joined"] },
  { slug: "transactions", label: "Transactions", icon: Receipt, columns: ["Reference", "User", "Service", "Amount", "Status", "Date"] },
  { slug: "top-resellers", label: "Top Resellers", icon: Trophy, columns: ["Rank", "Reseller", "Transactions", "Volume"] },
  { slug: "notifications", label: "Notifications", icon: Bell, columns: ["Title", "Audience", "Status", "Date"] },
  { slug: "data-pricing", label: "Data Pricing", icon: DollarSign, columns: ["Network", "Plan", "Type", "Validity", "Cost", "Selling price"] },
  { slug: "profit", label: "Profit & Reports", icon: TrendingUp, columns: ["Service", "Transactions", "Revenue", "Cost", "Profit"] },
  { slug: "wallets", label: "Wallets", icon: Wallet, columns: ["Owner", "Currency", "Balance", "Status", "Created"] },
  { slug: "referrals", label: "Referrals", icon: Gift, columns: ["Referrer", "Referred user", "Reward", "Status", "Date"] },
  { slug: "promo-banners", label: "Promo Banners", icon: Image, columns: ["Banner", "Title", "Destination", "Status"] },
  { slug: "settings", label: "Settings", icon: Settings },
];

export function getAdminSection(slug: string) {
  return adminSections.find((section) => section.slug === slug && slug !== "");
}