// Pagination Constants
const DEFAULT_CAR_VALUES = {
  MILEAGE: undefined,
  MAX_PRICE: undefined,
  MIN_PRICE: undefined,
  MAX_YEAR: undefined,
  MIN_YEAR: undefined,
  RADIUS: 150
}

const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  CAR_SALVAGE_PAGE_SIZE: 20,
  DEFAULT_PAGE_NUMBER: 1,
  MAX_PAGE_SIZE: 100,
  MAX_PAGE_NUMBER: 1000
};

// Car Search Constants
const SEARCH = {
  DEFAULT_RADIUS: 1000,
  DEFAULT_RADIUS_MARKET: 50,
  DEFAULT_SORT_FIELD: 'car.id',
  MIN_PAGE: 1,
  DEFAULT_LIMIT: 20,
  DEFAULT_ROWS: 50,
  MIN_YEAR: 2020,
  MAX_YEAR: 2024,
  DEFAULT_BODY_TYPE: 5
};

// PDF Generation
const PDF = {
  FORMAT: 'A4',
  MARGIN: 50,
  FONT_SIZES: {
    TITLE: 24,
    SECTION: 16,
    SUBSECTION: 16,
    BODY: 12
  }
};

// API Keys - These should ideally be in environment variables
const API_KEYS = {
  AUTO_DEV: process.env.AUTO_DEV_KEY,
  VEHICLE_DB: process.env.VEHICLE_DB,
  CAR_STAT: process.env.CAR_STAT,
};


const MANUFACTURERS = {
  POPULAR_THRESHOLD: 300
};


module.exports = {
  PAGINATION,
  SEARCH,
  PDF,
  API_KEYS,
  MANUFACTURERS,
  DEFAULT_CAR_VALUES
};
