/* ─────────────────────────────────────────────────────────────────
   Master translation map
   Keys  = English strings used directly in the UI
   Add new roles below as sections — the t() fallback keeps
   untranslated text showing in English, so partial maps are safe.
───────────────────────────────────────────────────────────────── */
export const translations = {
  hi: {
    /* ── super_admin: sidebar group labels ── */
    "User Management":         "उपयोगकर्ता प्रबंधन",
    "Dept Management":         "विभाग प्रबंधन",
    "Institution Management":  "संस्था प्रबंधन",
    "Committee Management":    "समिति प्रबंधन",
    "Access & Data":           "पहुंच और डेटा",
    "Audit":                   "ऑडिट",

    /* ── super_admin: sidebar nav item labels ── */
    "Dashboard":               "डैशबोर्ड",
    "Users":                   "उपयोगकर्ता",
    "Departments":             "विभाग",
    "Institutions":            "संस्थाएं",
    "Committees":              "समितियां",
    "Role & Access Control":   "भूमिका और पहुंच नियंत्रण",
    "Master Data":             "मास्टर डेटा",
    "Logs":                    "लॉग्स",

    /* ── shared: topbar ── */
    "PragatiMitra":            "प्रगति मित्र",
    "Search…":                 "खोजें…",

    /* ── shared sidebar footer ── */
    "Collapse":                "छोटा करें",

    /* ── finance_officer: sidebar ── */
    "Finance":                 "वित्त",
    "Estimates":               "अनुमान",
    "Audits":                  "ऑडिट्स",
    "Balance Sheet":           "बैलेंस शीट",

    /* ── directors_office: sidebar ── */
    "Review":                  "समीक्षा",
    "Review Queue":            "समीक्षा कतार",

    /* ── department_admin: sidebar ── */
    "Department Users":        "विभाग के उपयोगकर्ता",
    "Tasks":                   "कार्य",
    "Task Overview":           "कार्य अवलोकन",

    /* ── department_nodal_officer: sidebar ── */
    "Sections":                "अनुभाग",
    "Assigned Sections":       "असाइन किए गए अनुभाग",
    "Submissions":             "प्रस्तुतियां",

    /* ── institute_admin: sidebar ── */
    "Reports":                 "रिपोर्टें",
    "Report Setup":            "रिपोर्ट सेटअप",
    "Structure":               "संरचना",
    "Workflow":                "कार्यप्रवाह",
    "Task Workflow":           "कार्य प्रवाह",
    "Version & System":        "संस्करण और सिस्टम",
    "Version Control":         "संस्करण नियंत्रण",
    "System":                  "सिस्टम",

    /* ════════════════════════════════════════════════════════════
       SHARED UI ELEMENTS
    ════════════════════════════════════════════════════════════ */

    /* ── common buttons ── */
    "Edit":                    "संपादित करें",
    "Save":                    "सहेजें",
    "Save Changes":            "बदलाव सहेजें",
    "Cancel":                  "रद्द करें",
    "Delete":                  "हटाएं",
    "Activate":                "सक्रिय करें",
    "Deactivate":              "निष्क्रिय करें",
    "Saving…":                 "सहेज रहे हैं…",
    "Loading…":                "लोड हो रहा है…",
    "Retry":                   "पुनः प्रयास करें",
    "Add":                     "जोड़ें",
    "Remove":                  "हटाएं",
    "Back":                    "वापस",
    "Post":                    "पोस्ट करें",
    "Select":                  "चुनें",
    "Clear":                   "साफ़ करें",
    "Preview":                 "पूर्वावलोकन",
    "Download":                "डाउनलोड करें",
    "Export":                  "निर्यात करें",

    /* ── common status labels ── */
    "Active":                  "सक्रिय",
    "Inactive":                "निष्क्रिय",
    "Pending":                 "लंबित",
    "In Progress":             "प्रगति में",
    "Completed":               "पूर्ण",
    "Overdue":                 "अतिदेय",
    "Submitted":               "जमा किया गया",
    "Approved":                "स्वीकृत",
    "Sent Back":               "वापस भेजा गया",
    "In Review":               "समीक्षा में",
    "Draft":                   "ड्राफ्ट",
    "Under Review":            "समीक्षाधीन",

    /* ── common filter defaults ── */
    "All Statuses":            "सभी स्थितियां",
    "All Roles":               "सभी भूमिकाएं",
    "All":                     "सभी",

    /* ── common table headers ── */
    "Name":                    "नाम",
    "Email":                   "ईमेल",
    "Status":                  "स्थिति",
    "Actions":                 "क्रियाएं",
    "Section":                 "अनुभाग",
    "Department":              "विभाग",
    "Institution":             "संस्था",
    "Role":                    "भूमिका",
    "Date":                    "तिथि",
    "Description":             "विवरण",
    "Version":                 "संस्करण",
    "Note":                    "नोट",
    "Type":                    "प्रकार",
    "Stage":                   "चरण",

    /* ── common form fields ── */
    "Full Name":               "पूरा नाम",
    "Full Name *":             "पूरा नाम *",
    "Password":                "पासवर्ड",
    "Year":                    "वर्ष",
    "Start Date":              "शुरू तिथि",
    "End Date":                "समाप्ति तिथि",
    "Deadline":                "अंतिम तिथि",

    /* ════════════════════════════════════════════════════════════
       USER MANAGEMENT PAGE
    ════════════════════════════════════════════════════════════ */
    "+ New User":              "+ नया उपयोगकर्ता",
    "User":                    "उपयोगकर्ता",
    "Role(s)":                 "भूमिका(एं)",
    "Last Login":              "अंतिम लॉगिन",
    "No role":                 "कोई भूमिका नहीं",
    "No users match your filters.": "आपके फ़िल्टर से कोई उपयोगकर्ता नहीं मिला।",
    "Hide":                    "छुपाएं",
    "Show":                    "दिखाएं",
    "Min 8 characters...":     "न्यूनतम 8 अक्षर...",
    "Email Address *":         "ईमेल पता *",
    "Temporary Password *":    "अस्थायी पासवर्ड *",
    "Institution *":           "संस्था *",
    "Role *":                  "भूमिका *",
    "Account Status":          "खाता स्थिति",
    "— Select Institution —":  "— संस्था चुनें —",
    "— Select Role —":         "— भूमिका चुनें —",
    "Select institution first":"पहले संस्था चुनें",
    "— Select Department —":   "— विभाग चुनें —",
    "Create User":             "उपयोगकर्ता बनाएं",

    /* ════════════════════════════════════════════════════════════
       DEPARTMENT MANAGEMENT PAGE
    ════════════════════════════════════════════════════════════ */
    "New Department":          "नया विभाग",
    "Members":                 "सदस्य",
    "Code":                    "कोड",
    "Edit department":         "विभाग संपादित करें",
    "Deactivate department":   "विभाग निष्क्रिय करें",
    "Activate department":     "विभाग सक्रिय करें",
    "Loading departments…":    "विभाग लोड हो रहे हैं…",
    "Department Name":         "विभाग का नाम",
    "Department Code":         "विभाग कोड",
    "Auto-uppercased.":        "स्वतः बड़े अक्षरों में।",
    "Since":                   "से",

    /* ════════════════════════════════════════════════════════════
       INSTITUTION MANAGEMENT PAGE
    ════════════════════════════════════════════════════════════ */
    "+ New Institution":       "+ नई संस्था",
    "Loading institutions…":   "संस्थाएं लोड हो रही हैं…",
    "Institution Name":        "संस्था का नाम",
    "Institution Code":        "संस्था कोड",
    "Email Domain":            "ईमेल डोमेन",
    "Address Line 1":          "पता पंक्ति 1",
    "Address Line 2":          "पता पंक्ति 2",
    "City":                    "शहर",
    "Pincode":                 "पिनकोड",
    "State":                   "राज्य",
    "Country":                 "देश",
    "— Select State —":        "— राज्य चुनें —",

    /* ════════════════════════════════════════════════════════════
       COMMITTEES MANAGEMENT PAGE
    ════════════════════════════════════════════════════════════ */
    "Management Committees":   "प्रबंधन समितियां",
    "+ New Committee":         "+ नई समिति",
    "Contact":                 "संपर्क",
    "Added":                   "जोड़ा गया",
    "All Years":               "सभी वर्ष",
    "All Types":               "सभी प्रकार",
    "Search committees…":      "समितियां खोजें…",
    "Delete Committee?":       "समिति हटाएं?",
    "Yes, Delete":             "हां, हटाएं",
    "Deleting…":               "हटा रहे हैं…",
    "Finance Year":            "वित्त वर्ष",
    "Committee Type":          "समिति प्रकार",
    "Position":                "पद",
    "Add Member":              "सदस्य जोड़ें",
    "Designation":             "पदनाम",
    "Remove member":           "सदस्य हटाएं",
    "Loading committees…":     "समितियां लोड हो रही हैं…",

    /* ════════════════════════════════════════════════════════════
       AUDIT LOGS PAGE
    ════════════════════════════════════════════════════════════ */
    "Audit Logs":              "ऑडिट लॉग्स",
    "Actor":                   "कर्ता",
    "Message":                 "संदेश",
    "Action":                  "क्रिया",
    "Timestamp":               "समय-मुद्रांक",
    "Clear filters":           "फ़िल्टर साफ़ करें",
    "No audit logs found.":    "कोई ऑडिट लॉग नहीं मिला।",
    "← Prev":                  "← पिछला",
    "Next →":                  "अगला →",
    "Changes":                 "बदलाव",
    "IP Address":              "आईपी पता",
    "Browser":                 "ब्राउज़र",
    "User Agent":              "यूज़र एजेंट",
    "Not available":           "उपलब्ध नहीं",
    "Field":                   "फ़ील्ड",
    "Before":                  "पहले",
    "After":                   "बाद",
    "No permission details available.": "कोई अनुमति विवरण उपलब्ध नहीं।",

    /* ════════════════════════════════════════════════════════════
       ROLE & ACCESS CONTROL PAGE
    ════════════════════════════════════════════════════════════ */
    "Roles & Permissions":     "भूमिकाएं और अनुमतियां",
    "+ Create Role":           "+ भूमिका बनाएं",
    "Total Roles":             "कुल भूमिकाएं",
    "System Roles":            "सिस्टम भूमिकाएं",
    "Custom Roles":            "कस्टम भूमिकाएं",
    "Search roles…":           "भूमिकाएं खोजें…",
    "System":                  "सिस्टम",
    "Custom":                  "कस्टम",
    "No roles match your search.": "आपकी खोज से कोई भूमिका नहीं मिली।",
    "Permissions":             "अनुमतियां",
    "No description":          "कोई विवरण नहीं",
    "No capabilities assigned":"कोई क्षमताएं नहीं दी गई",
    "Edit Role":               "भूमिका संपादित करें",
    "New Role":                "नई भूमिका",
    "Create a new role":       "नई भूमिका बनाएं",
    "Role Key *":              "भूमिका कुंजी *",
    "Display Name *":          "प्रदर्शन नाम *",
    "Deselect all":            "सभी चुनाव हटाएं",
    "Select all":              "सभी चुनें",
    "Permission Summary":      "अनुमति सारांश",
    "Create Role":             "भूमिका बनाएं",
    "Form Access":             "फ़ॉर्म एक्सेस",
    "Administration & Audit":  "प्रशासन और ऑडिट",
    "Loading roles…":          "भूमिकाएं लोड हो रही हैं…",

    /* ════════════════════════════════════════════════════════════
       DEPARTMENT ADMIN — DASHBOARD
    ════════════════════════════════════════════════════════════ */
    "Department Admin":        "विभाग प्रशासक",
    "Department Dashboard":    "विभाग डैशबोर्ड",
    "Export Report":           "रिपोर्ट निर्यात करें",
    "Total Sections":          "कुल अनुभाग",
    "Assigned to dept":        "विभाग को असाइन",
    "Being worked on":         "पर काम हो रहा है",
    "Submitted & closed":      "जमा और बंद",
    "Need attention":          "ध्यान चाहिए",
    "Section-wise Completion": "अनुभाग-वार पूर्णता",
    "Assigned To":             "को असाइन किया गया",
    "Completion":              "पूर्णता",
    "Last Update":             "अंतिम अपडेट",
    "Section status — last update": "अनुभाग स्थिति — अंतिम अपडेट",
    "Bottleneck Alerts":       "बाधा अलर्ट",
    "Status distribution":     "स्थिति वितरण",

    /* ════════════════════════════════════════════════════════════
       DEPARTMENT ADMIN — USERS PAGE
    ════════════════════════════════════════════════════════════ */
    "Search by name or email…":"नाम या ईमेल से खोजें…",
    "No users match the current filters.": "वर्तमान फ़िल्टर से कोई उपयोगकर्ता नहीं मिला।",
    "Assign Sections":         "अनुभाग असाइन करें",
    "Select role…":            "भूमिका चुनें…",
    "Nodal Officer":           "नोडल अधिकारी",
    "Contributor":             "योगदानकर्ता",
    "Reviewer":                "समीक्षक",
    "Add New User":            "नया उपयोगकर्ता जोड़ें",
    "Edit User":               "उपयोगकर्ता संपादित करें",

    /* ════════════════════════════════════════════════════════════
       DEPARTMENT ADMIN — TASK OVERVIEW
    ════════════════════════════════════════════════════════════ */
    "Department Task Overview":"विभाग कार्य अवलोकन",
    "Search by section name…": "अनुभाग नाम से खोजें…",
    "All Assignees":           "सभी असाइनी",
    "No tasks match the current filters.": "वर्तमान फ़िल्टर से कोई कार्य नहीं मिला।",
    "Reassign":                "पुनः असाइन करें",
    "Remind":                  "याद दिलाएं",
    "Total:":                  "कुल:",
    "Reassign Task":           "कार्य पुनः असाइन करें",
    "Assign To":               "को असाइन करें",

    /* ════════════════════════════════════════════════════════════
       NODAL OFFICER — ASSIGNED SECTIONS PAGE
    ════════════════════════════════════════════════════════════ */
    "My Assigned Sections":    "मेरे असाइन किए गए अनुभाग",
    "Search sections…":        "अनुभाग खोजें…",
    "Subsections":             "उप-अनुभाग",
    "← Assigned Sections":     "← असाइन किए गए अनुभाग",
    "Edit Content":            "सामग्री संपादित करें",
    "Version History":         "संस्करण इतिहास",
    "Attachments":             "अनुलग्नक",
    "+ Upload file":           "+ फ़ाइल अपलोड करें",
    "✓ Saved":                 "✓ सहेजा गया",
    "No comments yet.":        "अभी कोई टिप्पणी नहीं।",
    "Add Comment":             "टिप्पणी जोड़ें",
    "Read only — select two versions to compare": "केवल पढ़ें — तुलना के लिए दो संस्करण चुनें",
    "Edited By":               "द्वारा संपादित",
    "Compare":                 "तुलना करें",
    "No sections match the current filters.": "वर्तमान फ़िल्टर से कोई अनुभाग नहीं मिला।",

    /* ════════════════════════════════════════════════════════════
       NODAL OFFICER — DASHBOARD
    ════════════════════════════════════════════════════════════ */
    "Dept. Nodal Officer":     "विभाग. नोडल अधिकारी",
    "My Dashboard":            "मेरा डैशबोर्ड",
    "Assigned":                "असाइन",
    "Pending review":          "समीक्षा लंबित",
    "Need revision":           "संशोधन चाहिए",
    "My Sections — Status Overview": "मेरे अनुभाग — स्थिति अवलोकन",
    "Click a section in Assigned Sections to edit": "संपादित करने के लिए असाइन किए गए अनुभाग में एक अनुभाग पर क्लिक करें",
    "Deadline:":               "अंतिम तिथि:",
    "Overall progress":        "समग्र प्रगति",
    "Overdue sections":        "अतिदेय अनुभाग",
    "Sent back — needs revision": "वापस भेजा — संशोधन चाहिए",
    "Quick Actions":           "त्वरित क्रियाएं",
    "Edit a section":          "एक अनुभाग संपादित करें",
    "View submissions":        "प्रस्तुतियां देखें",
    "Check comments":          "टिप्पणियां जांचें",

    /* ════════════════════════════════════════════════════════════
       NODAL OFFICER — SUBMISSIONS PAGE
    ════════════════════════════════════════════════════════════ */
    "My Submissions":          "मेरी प्रस्तुतियां",
    "Pipeline:":               "पाइपलाइन:",
    "All Stages":              "सभी चरण",
    "Submission Date":         "प्रस्तुति तिथि",
    "Current Stage":           "वर्तमान चरण",
    "No submissions match the current filters.": "वर्तमान फ़िल्टर से कोई प्रस्तुति नहीं मिली।",
    "View timeline ↗":         "टाइमलाइन देखें ↗",
    "Approval Timeline":       "अनुमोदन टाइमलाइन",
    "Sent Back Reason":        "वापस भेजने का कारण",

    /* ════════════════════════════════════════════════════════════
       DIRECTOR'S OFFICE — DASHBOARD
    ════════════════════════════════════════════════════════════ */
    "Director's Office":       "निदेशक का कार्यालय",
    "Report Review Dashboard": "रिपोर्ट समीक्षा डैशबोर्ड",
    "Go to Review Queue →":    "समीक्षा कतार पर जाएं →",
    "Approved by Pub. Cell":   "प्रकाशन सेल द्वारा स्वीकृत",
    "Pending Review":          "समीक्षा लंबित",
    "Ready for Compilation":   "संकलन के लिए तैयार",
    "Sections — Approval Pipeline": "अनुभाग — अनुमोदन पाइपलाइन",
    "All sections across departments — current report cycle": "सभी विभागों के अनुभाग — वर्तमान रिपोर्ट चक्र",
    "Submitted By":            "द्वारा जमा",
    "Pipeline distribution":   "पाइपलाइन वितरण",
    "⚑ Pending decisions":     "⚑ लंबित निर्णय",

    /* ════════════════════════════════════════════════════════════
       DIRECTOR'S OFFICE — REVIEW QUEUE PAGE
    ════════════════════════════════════════════════════════════ */
    "Section Review Queue":    "अनुभाग समीक्षा कतार",
    "Sections awaiting Director review — click a row to begin": "निदेशक समीक्षा की प्रतीक्षा में अनुभाग — शुरू करने के लिए एक पंक्ति पर क्लिक करें",
    "Section Name":            "अनुभाग नाम",
    "Review →":                "समीक्षा →",
    "← Back to Queue":         "← कतार पर वापस",
    "Section Content":         "अनुभाग सामग्री",
    "Click any block to add an inline comment": "इनलाइन टिप्पणी जोड़ने के लिए किसी भी ब्लॉक पर क्लिक करें",
    "Add a comment on this block…": "इस ब्लॉक पर टिप्पणी जोड़ें…",
    "Decision":                "निर्णय",
    "✓ Approve":               "✓ स्वीकृत करें",
    "↩ Send Back":             "↩ वापस भेजें",
    "Digital Signature":       "डिजिटल हस्ताक्षर",
    "I confirm this decision with my digital signature": "मैं अपने डिजिटल हस्ताक्षर से इस निर्णय की पुष्टि करता/करती हूं",
    "Approve & Initiate Compilation": "स्वीकृत करें और संकलन शुरू करें",
    "Send Back for Revision":  "संशोधन के लिए वापस भेजें",
    "Submit Decision":         "निर्णय जमा करें",
    "Section Approved":        "अनुभाग स्वीकृत",
    "Sent Back for Revision":  "संशोधन के लिए वापस भेजा गया",

    /* ════════════════════════════════════════════════════════════
       FINANCE OFFICER — ESTIMATES PAGE
    ════════════════════════════════════════════════════════════ */
    "Finance Module":          "वित्त मॉड्यूल",
    "Budget Estimate (BE) · Revised Estimate (RE) · Actual Expenditure (AE)": "बजट अनुमान (BE) · संशोधित अनुमान (RE) · वास्तविक व्यय (AE)",
    "⚙ Manage Schemes":        "⚙ योजनाएं प्रबंधित करें",
    "Scheme & Programme Selection": "योजना और कार्यक्रम चयन",
    "Scheme":                  "योजना",
    "Programme":               "कार्यक्रम",
    "— Select Scheme —":       "— योजना चुनें —",
    "— Select Programme —":    "— कार्यक्रम चुनें —",
    "Estimate Table":          "अनुमान तालिका",
    "Enter BE, RE and AE values (in ₹)": "BE, RE और AE मान दर्ज करें (₹ में)",
    "+ Add Row":               "+ पंक्ति जोड़ें",
    "Description / Sub-Head":  "विवरण / उप-शीर्ष",
    "BE (Budget Estimate) ₹":  "BE (बजट अनुमान) ₹",
    "RE (Revised Estimate) ₹": "RE (संशोधित अनुमान) ₹",
    "AE (Actual Expenditure) ₹": "AE (वास्तविक व्यय) ₹",
    "TOTAL":                   "कुल",
    "BE Total":                "BE कुल",
    "RE Total":                "RE कुल",
    "AE Total":                "AE कुल",
    "Rows":                    "पंक्तियां",
    "✕ Clear":                 "✕ साफ़ करें",
    "💾 Save as Draft":        "💾 ड्राफ्ट के रूप में सहेजें",
    "✓ Submit for Approval":   "✓ अनुमोदन के लिए जमा करें",

    /* ════════════════════════════════════════════════════════════
       FINANCE OFFICER — BALANCE SHEET PAGE
    ════════════════════════════════════════════════════════════ */
    "Schedule uploads":        "शेड्यूल अपलोड",
    "Schedule upload":         "शेड्यूल अपलोड",
    "Add schedule entries with supporting documents": "सहायक दस्तावेजों के साथ शेड्यूल प्रविष्टियां जोड़ें",
    "+ New entry":             "+ नई प्रविष्टि",
    "No entries saved yet...": "अभी कोई प्रविष्टि सहेजी नहीं गई...",
    "Schedule":                "शेड्यूल",
    "Supporting files":        "सहायक फ़ाइलें",
    "Select schedule…":        "शेड्यूल चुनें…",
    "+ Custom schedule name":  "+ कस्टम शेड्यूल नाम",
    "Enter custom schedule name": "कस्टम शेड्यूल नाम दर्ज करें",
    "Upload PDF / image":      "PDF / छवि अपलोड करें",
    "+ Add row":               "+ पंक्ति जोड़ें",
    "Save as draft":           "ड्राफ्ट के रूप में सहेजें",
    "Submit for approval":     "अनुमोदन के लिए जमा करें",
    "Back to schedules":       "शेड्यूल पर वापस",
    "Document date":           "दस्तावेज़ तिथि",
    "Saved on":                "पर सहेजा गया",
    "Files uploaded":          "फ़ाइलें अपलोड की गई",
    "Uploaded files":          "अपलोड की गई फ़ाइलें",
    "No files attached...":    "कोई फ़ाइल संलग्न नहीं...",
    "Download PDF":            "PDF डाउनलोड करें",
    "Edit entry":              "प्रविष्टि संपादित करें",
    "No files":                "कोई फ़ाइल नहीं",

    /* ════════════════════════════════════════════════════════════
       INSTITUTION ADMIN — OVERVIEW PAGE
    ════════════════════════════════════════════════════════════ */
    "Institute Overview":      "संस्था अवलोकन",
    "✦ New Report":            "✦ नई रिपोर्ट",
    "Dept":                    "विभाग",
    "Bottlenecks":             "बाधाएं",
    "All sections — current cycle": "सभी अनुभाग — वर्तमान चक्र",
    "Overdue tasks (live)":    "अतिदेय कार्य (लाइव)",

    /* ════════════════════════════════════════════════════════════
       INSTITUTION ADMIN — REPORT SETUP PAGE
    ════════════════════════════════════════════════════════════ */
    "Report Configuration":    "रिपोर्ट कॉन्फ़िगरेशन",
    "Manage sections, subsections, dates and workflow": "अनुभाग, उप-अनुभाग, तिथियां और कार्यप्रवाह प्रबंधित करें",
    "✦ Save Report":           "✦ रिपोर्ट सहेजें",
    "Report":                  "रिपोर्ट",
    "Section Tree":            "अनुभाग वृक्ष",
    "Report Settings":         "रिपोर्ट सेटिंग्स",
    "Section Config":          "अनुभाग कॉन्फ़िग",
    "Assignments":             "असाइनमेंट",
    "Report Name":             "रिपोर्ट नाम",
    "Submission Deadline":     "प्रस्तुति अंतिम तिथि",
    "Review Window":           "समीक्षा विंडो",
    "Data Source":             "डेटा स्रोत",
    "Timeline":                "टाइमलाइन",
    "Start":                   "शुरू",
    "Review End":              "समीक्षा समाप्त",
    "✓ Apply Changes":         "✓ बदलाव लागू करें",
    "Select a section from the tree": "वृक्ष से एक अनुभाग चुनें",
    "No subsections yet.":     "अभी कोई उप-अनुभाग नहीं।",
    "+ Add Subsection":        "+ उप-अनुभाग जोड़ें",
    "+ Add Section":           "+ अनुभाग जोड़ें",
    "Unassigned":              "असाइन नहीं",
  },
};

/**
 * t(key, lang)
 * Returns the translated string for the given language.
 * Falls back to the original key if the translation is missing —
 * so partial translation maps never break the UI.
 *
 * @param {string} key   - The English source string
 * @param {string} lang  - 'en' | 'hi'
 */
export function t(key, lang = "en") {
  if (!key) return key;
  if (lang === "en") return key;
  return translations[lang]?.[key] ?? key;
}
