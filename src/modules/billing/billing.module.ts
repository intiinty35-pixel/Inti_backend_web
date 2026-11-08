import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingCatalogService } from "./billing-catalog.service";
import { BillingOrdersService } from "./billing-orders.service";
import { BillingAccountsService } from "./billing-accounts.service";
import { BillingMaintenanceService } from "./billing-maintenance.service";
import { PaymentReceiptsService } from "./payment-receipts.service";
import { SubscriptionPolicyService } from "./subscription-policy.service";
import { ManualPaymentProviders } from "./manual-payment.provider";
import { BillingAdminController, BillingCatalogController, BillingController, BillingRateGuard } from "./billing.controller";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [BillingCatalogController, BillingController, BillingAdminController],
  providers: [BillingCatalogService, BillingOrdersService, BillingAccountsService, BillingMaintenanceService, PaymentReceiptsService, SubscriptionPolicyService, ManualPaymentProviders, BillingRateGuard],
  exports: [SubscriptionPolicyService, BillingAccountsService],
})
export class BillingModule {}
