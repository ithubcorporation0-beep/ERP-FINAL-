import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyProfileForm } from "@/features/settings/company-profile-form";
import { LogoUploader } from "@/features/settings/logo-uploader";
import { PreferencesForm } from "@/features/settings/preferences-form";
import { authorizePage } from "@/lib/auth/page";
import { MONTH_OPTIONS, countryOptions, currencyOptions, localeOptions, timeZoneOptions } from "@/lib/intl";
import { can } from "@/lib/tenant";
import { companyService } from "@/server/services/company.service";
import { settingsService } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await authorizePage("settings:view");
  if (!ctx) return <AccessDenied />;

  const [company, settings] = await Promise.all([
    companyService.getProfile(ctx),
    settingsService.getAll(ctx),
  ]);
  const readOnly = !can(ctx, "settings:manage");

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your company's profile, logo and preferences." />
      {readOnly ? (
        <Alert>
          <AlertDescription>
            You can view these settings. Only people with the “Manage settings” permission can change them.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>Company profile</CardTitle>
          <CardDescription>
            Shown on documents and used for currency, dates and the fiscal year.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyProfileForm
            readOnly={readOnly}
            defaults={{
              name: company.name,
              legalName: company.legalName ?? "",
              taxId: company.taxId ?? "",
              email: company.email ?? "",
              phone: company.phone ?? "",
              address: company.address ?? "",
              country: company.country ?? "",
              baseCurrency: company.baseCurrency,
              timezone: company.timezone,
              locale: company.locale,
              fiscalYearStartMonth: company.fiscalYearStartMonth,
            }}
            options={{
              countries: countryOptions(),
              currencies: currencyOptions(),
              timeZones: timeZoneOptions(),
              locales: localeOptions(company.locale),
              months: MONTH_OPTIONS,
            }}
          />
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>Appears next to the company name for everyone in the company.</CardDescription>
        </CardHeader>
        <CardContent>
          <LogoUploader
            readOnly={readOnly}
            logoUrl={company.logoKey ? `/api/company/logo?v=${company.logoUpdatedAt?.getTime() ?? 0}` : null}
          />
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <PreferencesForm
            readOnly={readOnly}
            defaults={{
              dateFormat: settings["general.dateFormat"],
              weekStartsOn: settings["general.weekStartsOn"],
              invoiceNumberPrefix: settings["documents.invoiceNumberPrefix"],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
