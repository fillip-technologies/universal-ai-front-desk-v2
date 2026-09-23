/**
 * State administrative reference data.
 *
 * This reference deployment ships with Bihar's 38 districts and their
 * community development blocks, used to populate the district/block
 * selectors in the citizen portal, the signup form and the official
 * dashboard filters. Swap this file's contents for another state's
 * district/block hierarchy to redeploy JanSunwayi AI there.
 *
 * This is government reference data, not sample content — there is no mock
 * grievance data anywhere in this application. Every complaint shown in the
 * UI is a real record filed through one of the intake channels and read back
 * from Postgres.
 */
export const BIHAR_DISTRICTS: Record<string, string[]> = {
  Araria: ['Araria', 'Forbesganj', 'Raniganj', 'Narpatganj', 'Bhargama', 'Jokihat', 'Palasi', 'Sikti', 'Kursakanta'],
  Arwal: ['Arwal', 'Kaler', 'Kurtha', 'Karpi', 'Sonbhadra Banshi Suryapur'],
  Aurangabad: ['Aurangabad', 'Daudnagar', 'Obra', 'Rafiganj', 'Nabinagar', 'Madanpur', 'Kutumba', 'Goh', 'Haspura', 'Barun', 'Deo'],
  Banka: ['Banka', 'Amarpur', 'Barahat', 'Belhar', 'Bounsi', 'Chandan', 'Dhoraiya', 'Fullidumar', 'Katoria', 'Rajoun', 'Shambhuganj'],
  Begusarai: ['Begusarai', 'Barauni', 'Teghra', 'Bakhri', 'Balia', 'Matihani', 'Sahebpur Kamal', 'Bhagwanpur', 'Cheria Bariarpur', 'Chhaurahi', 'Dandari', 'Garhpura', 'Khodabandpur', 'Mansurchak', 'Naokothi', 'Birpur', 'Shamho Akha Kurha'],
  Bhagalpur: ['Bhagalpur', 'Nathnagar', 'Sultanganj', 'Kahalgaon', 'Bihpur', 'Colgong', 'Goradih', 'Ismailpur', 'Jagdishpur', 'Narayanpur', 'Pirpainti', 'Rangra Chowk', 'Sabour', 'Sanhaula', 'Shahkund', 'Gopalpur'],
  Bhojpur: ['Arrah', 'Jagdishpur', 'Piro', 'Shahpur', 'Barhara', 'Behea', 'Charpokhari', 'Garhani', 'Koilwar', 'Sahar', 'Sandesh', 'Tarari', 'Udwant Nagar', 'Agiaon'],
  Buxar: ['Buxar', 'Dumraon', 'Rajpur', 'Brahampur', 'Chakki', 'Chausa', 'Itarhi', 'Kesath', 'Nawanagar', 'Simri', 'Chaugain'],
  Darbhanga: ['Darbhanga Sadar', 'Keoti', 'Benipur', 'Hayaghat', 'Jale', 'Bahadurpur', 'Baheri', 'Biraul', 'Ghanshyampur', 'Gaura Bauram', 'Hanumannagar', 'Kiratpur', 'Kusheshwar Asthan', 'Manigachhi', 'Singhwara', 'Alinagar', 'Tardih', 'Bahera'],
  'East Champaran': ['Motihari', 'Areraj', 'Chakia', 'Dhaka', 'Raxaul', 'Pakridayal', 'Adapur', 'Banjaria', 'Bankatwa', 'Chiraia', 'Dhaka Sadar', 'Ghorasahan', 'Harsidhi', 'Kalyanpur', 'Kesaria', 'Kotwa', 'Madhuban', 'Mehsi', 'Paharpur', 'Patahi', 'Phenhara', 'Piprakothi', 'Ramgarhwa', 'Sangrampur', 'Sugauli', 'Tetaria', 'Turkaulia'],
  Gaya: ['Gaya Town', 'Bodh Gaya', 'Wazirganj', 'Tekari', 'Sherghati', 'Belaganj', 'Atri', 'Amas', 'Banke Bazar', 'Barachatti', 'Bathani', 'Dobhi', 'Dumaria', 'Fatehpur', 'Gurua', 'Guraru', 'Imamganj', 'Khizarsarai', 'Konch', 'Manpur', 'Mohanpur', 'Muhra', 'Neemchak Bathani', 'Paraiya', 'Tankuppa'],
  Gopalganj: ['Gopalganj', 'Hathua', 'Barauli', 'Baikunthpur', 'Bhorey', 'Kateya', 'Kuchaikote', 'Manjha', 'Panchdeori', 'Phulwaria', 'Sidhwalia', 'Thawe', 'Uchkagaon', 'Vijayipur'],
  Jamui: ['Jamui', 'Jhajha', 'Chakai', 'Sikandra', 'Aliganj', 'Barhat', 'Gidhaur', 'Islamnagar Aliganj', 'Khaira', 'Lakshmipur', 'Sono'],
  Jehanabad: ['Jehanabad', 'Makhdumpur', 'Ghosi', 'Hulasganj', 'Kako', 'Modanganj', 'Ratni Faridpur'],
  Kaimur: ['Bhabua', 'Mohania', 'Ramgarh', 'Chainpur', 'Adhaura', 'Bhagwanpur', 'Chand', 'Durgawati', 'Kudra', 'Nuaon', 'Rampur'],
  Katihar: ['Katihar', 'Barsoi', 'Manihari', 'Korha', 'Amdabad', 'Azamnagar', 'Balrampur', 'Barari', 'Dandkhora', 'Falka', 'Hasanganj', 'Kadwa', 'Kursela', 'Mansahi', 'Pranpur', 'Sameli'],
  Khagaria: ['Khagaria', 'Gogri', 'Alauli', 'Beldaur', 'Chautham', 'Mansi', 'Parbatta'],
  Kishanganj: ['Kishanganj Sadar', 'Bahadurganj', 'Thakurganj', 'Dighalbank', 'Kochadhaman', 'Pothia', 'Terhagachh'],
  Lakhisarai: ['Lakhisarai', 'Barahiya', 'Halsi', 'Chanan', 'Piri Bazar', 'Ramgarh Chowk', 'Surajgarha'],
  Madhepura: ['Madhepura', 'Udakishunganj', 'Singheshwar', 'Alamnagar', 'Bihariganj', 'Chausa', 'Gamharia', 'Ghailarh', 'Gwalpara', 'Kumarkhand', 'Murliganj', 'Puraini', 'Shankarpur'],
  Madhubani: ['Madhubani', 'Jhanjharpur', 'Benipatti', 'Phulparas', 'Andhratharhi', 'Babubarhi', 'Basopatti', 'Bisfi', 'Ghoghardiha', 'Harlakhi', 'Jaynagar', 'Kaluahi', 'Khajauli', 'Ladania', 'Lakhnaur', 'Laukaha', 'Laukahi', 'Madhepur', 'Madhwapur', 'Pandaul', 'Rajnagar', 'Rahika'],
  Munger: ['Munger Sadar', 'Jamalpur', 'Haveli Kharagpur', 'Tarapur', 'Asarganj', 'Bariyarpur', 'Dharhara', 'Sangrampur', 'Tetiabambar'],
  Muzaffarpur: ['Kanti', 'Musahari', 'Sakra', 'Kurhani', 'Bochahan', 'Aurai', 'Bandra', 'Gaighat', 'Katra', 'Marwan', 'Meenapur', 'Motipur', 'Mushahari', 'Paroo', 'Saraiya', 'Sahebganj'],
  Nalanda: ['Bihar Sharif', 'Rajgir', 'Hilsa', 'Islampur', 'Asthawan', 'Ben', 'Chandi', 'Ekangarsarai', 'Giriak', 'Harnaut', 'Karai Parsurai', 'Katrisarai', 'Nagarnausa', 'Noorsarai', 'Parwalpur', 'Rahui', 'Sarmera', 'Silao', 'Tharthari'],
  Nawada: ['Nawada', 'Warisaliganj', 'Rajauli', 'Hisua', 'Akbarpur', 'Govindpur', 'Kashi Chak', 'Kawakol', 'Meskaur', 'Narhat', 'Nardiganj', 'Pakribarawan', 'Roh', 'Sirdala'],
  Patna: ['Patna Sadar', 'Maner', 'Phulwari Sharif', 'Danapur', 'Bihta', 'Bakhtiarpur', 'Athmalgola', 'Barh', 'Belchhi', 'Bihariganj', 'Daniyawan', 'Dhanarua', 'Dulhin Bazar', 'Fatuha', 'Ghoswari', 'Khusrupur', 'Masaurhi', 'Mokama', 'Naubatpur', 'Paliganj', 'Pandarak', 'Punpun', 'Sampatchak'],
  Purnia: ['Purnia East', 'Kasba', 'Banmankhi', 'Dhamdaha', 'Amour', 'Baisa', 'Baisi', 'Barhara Kothi', 'Bhawanipur', 'Dagarua', 'Jalalgarh', 'K. Nagar', 'Rupauli', 'Srinagar'],
  Rohtas: ['Sasaram', 'Dehri', 'Bikramganj', 'Nokha', 'Akorhi Gola', 'Chenari', 'Dawath', 'Dinara', 'Kargahar', 'Karakat', 'Kochas', 'Nasriganj', 'Nauhatta', 'Rajpur', 'Rohtas', 'Sanjhauli', 'Sheosagar', 'Suryapura', 'Tilouthu'],
  Saharsa: ['Saharsa Sadar', 'Simri Bakhtiyarpur', 'Sonbarsa', 'Banma Itahri', 'Kahara', 'Mahishi', 'Nauhatta', 'Patarghat', 'Salkhua', 'Satar Kataiya'],
  Samastipur: ['Samastipur', 'Rosera', 'Dalsinghsarai', 'Patori', 'Bibhutipur', 'Bithan', 'Hasanpur', 'Kalyanpur', 'Khanpur', 'Mohanpur', 'Mohiuddinnagar', 'Morwa', 'Pusa', 'Sarairanjan', 'Shivaji Nagar', 'Singhia', 'Tajpur', 'Ujiarpur', 'Vidyapati Nagar', 'Warisnagar'],
  Saran: ['Chapra Sadar', 'Sonepur', 'Marhaura', 'Revelganj', 'Amnour', 'Baniapur', 'Dariapur', 'Dighwara', 'Ekma', 'Garkha', 'Isuapur', 'Jalalpur', 'Lahladpur', 'Maker', 'Manjhi', 'Mashrakh', 'Nagra', 'Panapur', 'Parsa', 'Taraiya'],
  Sheikhpura: ['Sheikhpura', 'Barbigha', 'Ariari', 'Chewara', 'Ghat Kusumbha', 'Shekhopur Sarai'],
  Sheohar: ['Sheohar', 'Dumri Katsari', 'Piprarhi', 'Purnahiya', 'Tariyani'],
  Sitamarhi: ['Sitamarhi (Dumra)', 'Belsand', 'Pupri', 'Bairgania', 'Bajpatti', 'Bathnaha', 'Bokhara', 'Charaut', 'Nanpur', 'Parihar', 'Parsauni', 'Riga', 'Runnisaidpur', 'Sonbarsa', 'Sursand', 'Suppi', 'Majorganj'],
  Siwan: ['Siwan Sadar', 'Maharajganj', 'Barharia', 'Andar', 'Basantpur', 'Bhagwanpur Hat', 'Daraundha', 'Darauli', 'Goriakothi', 'Guthani', 'Hasanpura', 'Hussainganj', 'Lakri Nabiganj', 'Mairwa', 'Nautan', 'Pachrukhi', 'Raghunathpur', 'Siswan', 'Ziradei'],
  Supaul: ['Supaul', 'Nirmali', 'Triveniganj', 'Basantpur', 'Chhatapur', 'Kishanpur', 'Marauna', 'Pipra', 'Pratapganj', 'Raghopur', 'Saraigarh Bhaptiyahi'],
  Vaishali: ['Hajipur Sadar', 'Mahnar', 'Raghopur', 'Patepur', 'Bidupur', 'Chehrakalan', 'Desri', 'Goraul', 'Jandaha', 'Lalganj', 'Mahua', 'Paterhi Belsar', 'Rajapakar', 'Sahdei Buzurg', 'Vaishali', 'Bhagwanpur'],
  'West Champaran': ['Bettiah', 'Bagaha', 'Narkatiaganj', 'Lauriya', 'Bairia', 'Bhitaha', 'Chanpatia', 'Gaunaha', 'Jogapatti', 'Madhubani', 'Mainatanr', 'Majhaulia', 'Nautan', 'Piprasi', 'Ramnagar', 'Sikta', 'Thakrahan', 'Yogapatti']
};

/** Sorted district names, for dropdowns. */
export const BIHAR_DISTRICT_NAMES: string[] = Object.keys(BIHAR_DISTRICTS).sort();

/** Blocks for a district, or an empty list for an unknown district. */
export function blocksForDistrict(district: string): string[] {
  return BIHAR_DISTRICTS[district] ?? [];
}
