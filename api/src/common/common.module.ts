import { Global, Module } from '@nestjs/common';
import { OwnerEditBudget } from './guards/owner-edit-budget.guard';
import { RequestContext } from './request-context';

@Global()
@Module({
  providers: [RequestContext, OwnerEditBudget],
  exports: [RequestContext, OwnerEditBudget],
})
export class CommonModule {}
