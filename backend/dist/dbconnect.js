"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbconnect = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = "https://cbojksaekjksptonwtmp.supabase.co";
const supabaseKey = "sb_publishable_E1metQXel63A9zRWCM8CSA_6owwQ3pH";
if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in backend/.env');
}
exports.dbconnect = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
//# sourceMappingURL=dbconnect.js.map