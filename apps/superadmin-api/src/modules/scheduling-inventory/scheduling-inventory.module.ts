import { Module } from "@nestjs/common";
import { SchedulingInventoryController } from "./interface/scheduling-inventory.controller";

@Module({
  controllers: [SchedulingInventoryController]
})
export class SchedulingInventoryModule {}
