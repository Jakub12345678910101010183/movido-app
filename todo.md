# Movido Project TODO

## Completed Features
- [x] Landing page with Terminal Noir design
- [x] Dashboard with dispatch center
- [x] TomTom map integration with HGV layers
- [x] AI Route Planner modal
- [x] Fixed Sequence Guide
- [x] Export to Movido Driver
- [x] ETA Dashboard expansion
- [x] Digital POD status
- [x] Sidebar navigation
- [x] Job Management page (UI)
- [x] Fleet Management page (UI)
- [x] Driver Management page (UI)
- [x] Routes page
- [x] Safety Alerts page
- [x] Analytics page
- [x] Reports page
- [x] Settings page
- [x] ROI Calculator on pricing page

## Database CRUD Implementation
- [x] Create database schema for vehicles, drivers, jobs
- [x] Implement Fleet CRUD API (create, read, update, delete vehicles)
- [x] Implement Drivers CRUD API (create, read, update, delete drivers)
- [x] Implement Jobs CRUD API (create, read, update, delete jobs)
- [x] Add Vehicle form with database persistence
- [x] Add Driver form with database persistence
- [x] Add Job form with database persistence
- [x] Edit Vehicle functionality
- [x] Edit Driver functionality
- [x] Edit Job functionality
- [x] Delete functionality for all entities
- [x] Real-time list updates after mutations

## AI Route Optimizer Implementation
- [x] Google Geocoding API integration for postcode lookup
- [x] Map markers and waypoint management
- [x] Auto-zoom and re-center map to show all waypoints
- [x] TSP optimization algorithm for route sequencing
- [x] Route line drawing on map after optimization
- [x] HGV constraints (Height 4.95m, Weight 44t)
- [x] Safety alerts for low bridges and CAZ/ULEZ zones
- [x] Confirm & Save button to create Jobs from optimized routes

## Drag & Drop Waypoint Reordering
- [x] Implement drag-and-drop for waypoint list in AI Route Planner
- [x] Update map markers when waypoints are reordered
- [x] Maintain waypoint numbering after reorder
