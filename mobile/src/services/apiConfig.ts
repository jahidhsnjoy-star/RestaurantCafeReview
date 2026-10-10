const USE_USB_REVERSE = true;

const USB_API_BASE_URL = 'http://localhost:5000';
const WIFI_API_BASE_URL = 'http://192.168.0.109:5000';

export const API_BASE_URL = USE_USB_REVERSE
	? USB_API_BASE_URL
	: WIFI_API_BASE_URL;