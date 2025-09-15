// This must be the very first line of your file.
import 'react-native-gesture-handler';

import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, StatusBar, SafeAreaView, FlatList, ActivityIndicator, Alert, Linking, ScrollView, Image } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

// --- CONFIGURATION ---
const API_URL = 'https://madina-server.onrender.com/api';
const QR_CODE_IMAGE_URL = 'https://raw.githubusercontent.com/sounicbehera/madina-assets/main/bing_generated_qrcode.png';

// --- Authentication "Brain" (Context) ---
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
    const [authState, setAuthState] = useState({ user: null, isLoading: true });

    useEffect(() => {
        const loadUserFromStorage = async () => {
            try {
                const userString = await AsyncStorage.getItem('user');
                setAuthState({ user: userString ? JSON.parse(userString) : null, isLoading: false });
            } catch (e) { setAuthState({ user: null, isLoading: false }); }
        };
        loadUserFromStorage();
    }, []);

    const login = async (employeeId, password) => {
        try {
            const response = await axios.post(`${API_URL}/technicians/login`, { employeeId, password });
            const user = response.data.technician;
            await AsyncStorage.setItem('user', JSON.stringify(user));
            setAuthState({ user, isLoading: false });
        } catch (error) {
            const errorMessage = error.response?.data?.message || "An error occurred during login.";
            Alert.alert("Login Failed", errorMessage);
        }
    };

    const logout = async () => {
        await AsyncStorage.removeItem('user');
        setAuthState({ user: null, isLoading: false });
    };

    return <AuthContext.Provider value={{ authState, login, logout }}>{children}</AuthContext.Provider>;
};

// --- Reusable Password Input with Eye Icon ---
const PasswordInput = ({ placeholder, value, onChangeText }) => {
    const [isSecure, setIsSecure] = useState(true);
    return (
        <View style={styles.inputContainer}>
            <TextInput style={styles.inputField} placeholder={placeholder} placeholderTextColor="#999" secureTextEntry={isSecure} value={value} onChangeText={onChangeText} />
            <TouchableOpacity onPress={() => setIsSecure(!isSecure)} style={styles.eyeIcon}>
                <Ionicons name={isSecure ? 'eye-off' : 'eye'} size={24} color="#9ca3af" />
            </TouchableOpacity>
        </View>
    );
};

// --- SCREEN COMPONENTS ---

const LoginScreen = () => {
    const { login } = useContext(AuthContext);
    const [employeeId, setEmployeeId] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!employeeId || !password) { Alert.alert("Error", "Please enter both Employee ID and Password."); return; }
        setLoading(true);
        await login(employeeId, password);
        setLoading(false);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.loginContainer}>
                <StatusBar barStyle="light-content" />
                <View style={styles.header}><Text style={styles.title}>Madina TechConnect</Text><Text style={styles.subtitle}>Technician Login</Text></View>
                <View style={styles.form}>
                    <TextInput style={styles.input} placeholder="Employee ID (e.g., 2389045)" value={employeeId} onChangeText={setEmployeeId} keyboardType="numeric" />
                    <PasswordInput placeholder="Password" value={password} onChangeText={setPassword} />
                    <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Log In</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
};

const DashboardScreen = ({ navigation }) => {
    const { authState } = useContext(AuthContext);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchJobs = useCallback(async () => {
        if (!authState.user) return;
        setLoading(true);
        try {
            const response = await axios.get(`${API_URL}/enquiries/technician/${authState.user.id}`);
            const activeJobs = response.data.filter(job => job.status !== 'Completed' && job.status !== 'Cancelled' && job.status !== 'Rescheduled');
            setJobs(activeJobs);
        } catch (error) { Alert.alert("Error", "Could not fetch jobs."); }
        setLoading(false);
    }, [authState.user]);

    useFocusEffect(fetchJobs);
    
    const JobCard = ({ item }) => (
      <TouchableOpacity style={styles.jobCard} onPress={() => navigation.navigate('JobDetails', { jobId: item._id })}>
        <Text style={styles.jobCardCustomer}>{item.name}</Text>
        <Text style={styles.jobCardService}>{item.serviceType}</Text>
        <View style={[styles.statusBadge, {backgroundColor: '#e0f2fe'}]}><Text style={[styles.statusBadgeText, {color: '#0ea5e9'}]}>{item.status}</Text></View>
      </TouchableOpacity>
    );

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1e3a8a" /></View>;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <Text style={styles.screenTitle}>My Active Jobs</Text>
            {jobs.length === 0 ? (<View style={styles.center}><Text>No active jobs assigned.</Text></View>) : (<FlatList data={jobs} renderItem={JobCard} keyExtractor={item => item._id} numColumns={2} contentContainerStyle={{ paddingHorizontal: 10 }} />)}
        </SafeAreaView>
    );
};

const JobDetailsScreen = ({ route, navigation }) => {
    const { jobId } = route.params;
    const [job, setJob] = useState(null);
    const [loading, setLoading] = useState(true);
    
    useFocusEffect(useCallback(() => {
        const fetchJobDetails = async () => {
            setLoading(true);
            try {
                const response = await axios.get(`${API_URL}/enquiries`);
                const currentJob = response.data.find(j => j._id === jobId);
                setJob(currentJob);
            } catch(e) { Alert.alert("Error", "Could not fetch job details.")}
            setLoading(false);
        }
        fetchJobDetails();
    }, [jobId]));

    const updateStatus = async (newStatus) => {
        try {
            await axios.patch(`${API_URL}/enquiries/${job._id}/status`, { status: newStatus });
            Alert.alert("Success", `Job status updated to "${newStatus}"`);
            navigation.navigate("Dashboard");
        } catch (error) { Alert.alert("Error", "Could not update job status."); }
    };

    if(loading || !job) return <View style={styles.center}><ActivityIndicator size="large" color="#1e3a8a" /></View>;

    return (
        <SafeAreaView style={styles.container}>
          <ScrollView>
            <View style={styles.detailsCard}>
                <Text style={styles.detailsCustomer}>{job.name}</Text>
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${job.phone}`)}><Text style={styles.detailsPhone}>{job.phone}</Text></TouchableOpacity>
                <Text style={styles.detailsAddress}>{job.address}</Text>
                <Text style={styles.detailsLandmark}>Landmark: {job.landmark || 'N/A'}</Text>
                <View style={styles.separator} />
                <Text style={styles.detailsService}>Service: {job.serviceType}</Text>
                {job.latitude && <TouchableOpacity style={styles.directionsButton} onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${job.latitude},${job.longitude}`)}><Text style={styles.loginButtonText}>Get Directions</Text></TouchableOpacity>}
            </View>
            <View style={styles.statusButtonsContainer}>
                <TouchableOpacity style={styles.statusButton} onPress={() => updateStatus('On the way')}><Text>On The Way</Text></TouchableOpacity>
                <TouchableOpacity style={styles.statusButton} onPress={() => updateStatus('Working')}><Text>Start Work</Text></TouchableOpacity>
                <TouchableOpacity style={styles.statusButton} onPress={() => updateStatus('Rescheduled')}><Text>Reschedule</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.statusButton, {backgroundColor: '#16a34a'}]} onPress={() => navigation.navigate('Payment', { job: job })}><Text style={{color: 'white', fontWeight: 'bold'}}>Proceed to Payment</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
    );
};

const PaymentScreen = ({ route, navigation }) => {
    const { job } = route.params;
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [loading, setLoading] = useState(false);

    const handleFinalize = async () => {
        if (!amount) { Alert.alert("Error", "Please enter the amount received."); return; }
        setLoading(true);
        try {
            await axios.patch(`${API_URL}/enquiries/${job._id}/status`, { status: 'Completed', amountCollected: parseFloat(amount) });
            Alert.alert("Success", "Job marked as complete!");
            navigation.popToTop();
        } catch (error) { Alert.alert("Error", "Could not finalize job. Please try again."); }
        setLoading(false);
    };

    return (
        <SafeAreaView style={styles.container}>
             <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text style={styles.screenTitle}>Finalize Payment</Text>
                <View style={styles.paymentCard}>
                    <Text style={styles.paymentLabel}>Amount Received (₹)</Text>
                    <TextInput style={styles.input} placeholder="Enter amount" keyboardType="numeric" value={amount} onChangeText={setAmount}/>
                    <Text style={styles.paymentLabel}>Payment Method</Text>
                    <View style={styles.paymentMethodContainer}>
                        <TouchableOpacity style={[styles.paymentMethodButton, paymentMethod === 'Cash' && styles.paymentMethodSelected]} onPress={() => setPaymentMethod('Cash')}><Text style={styles.paymentMethodText}>Cash</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.paymentMethodButton, paymentMethod === 'UPI' && styles.paymentMethodSelected]} onPress={() => setPaymentMethod('UPI')}><Text style={styles.paymentMethodText}>UPI</Text></TouchableOpacity>
                    </View>
                    {paymentMethod === 'UPI' && (<View style={styles.qrCodeContainer}><Text style={styles.qrCodeText}>Show QR code to customer</Text><Image source={{ uri: QR_CODE_IMAGE_URL }} style={styles.qrCodeImage}/></View>)}
                    <TouchableOpacity style={styles.finalizeButton} onPress={handleFinalize} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Mark as Received & Complete Job</Text>}</TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const ProfileScreen = () => {
    const { authState, logout } = useContext(AuthContext);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChangePassword = async () => {
        if (!oldPassword || !newPassword) { Alert.alert("Error", "Please fill all fields."); return; }
        setLoading(true);
        try {
            await axios.patch(`${API_URL}/technicians/change-password`, { 
                employeeId: authState.user.employeeId, 
                oldPassword, 
                newPassword 
            });
            Alert.alert("Success", "Password changed successfully! Please log in again.", [{ text: "OK", onPress: () => logout() }]);
        } catch (error) { 
            Alert.alert("Error", error.response?.data?.message || "Could not change password.");
        } finally { setLoading(false); }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <Text style={styles.screenTitle}>My Profile</Text>
            <View style={styles.profileCard}>
                <Text style={styles.profileLabel}>Name: <Text style={styles.profileValue}>{authState.user?.name}</Text></Text>
                <Text style={styles.profileLabel}>Employee ID: <Text style={styles.profileValue}>{authState.user?.employeeId}</Text></Text>
                <Text style={styles.changePasswordTitle}>Change Password</Text>
                <PasswordInput placeholder="Old Password" value={oldPassword} onChangeText={setOldPassword} />
                <PasswordInput placeholder="New Password" value={newPassword} onChangeText={setNewPassword} />
                <TouchableOpacity style={styles.loginButton} onPress={handleChangePassword} disabled={loading}>
                     {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Update Password</Text>}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

// --- NAVIGATION ---
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

const JobStackNavigator = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="JobDetails" component={JobDetailsScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
    </Stack.Navigator>
);

const AppNavigator = () => {
    const { logout } = useContext(AuthContext);
    return (
        <Drawer.Navigator initialRouteName="JobStack" screenOptions={{
            drawerStyle: { backgroundColor: '#1e3a8a' },
            drawerLabelStyle: { color: 'white', fontSize: 16 },
            headerStyle: { backgroundColor: '#f1f5f9', elevation: 0, shadowOpacity: 0 },
            headerTintColor: '#1e293b'
        }}>
            <Drawer.Screen name="JobStack" component={JobStackNavigator} options={{ title: 'Dashboard' }} />
            <Drawer.Screen name="Profile" component={ProfileScreen} />
            <Drawer.Screen name="Logout" component={() => { useEffect(() => { logout() }, []); return null; }} />
        </Drawer.Navigator>
    );
};

// --- Main App "TRAFFIC COP" ---
const Root = () => {
    const { authState } = useContext(AuthContext);
    if (authState.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#1e3a8a" /></View>;
    return authState.user ? <AppNavigator /> : <LoginScreen />;
};

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Root />
      </NavigationContainer>
    </AuthProvider>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  safeArea: { flex: 1, backgroundColor: '#1e3a8a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  screenTitle: { fontSize: 28, fontWeight: 'bold', padding: 20 },
  loginContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 18, color: '#dbeafe' },
  form: { backgroundColor: '#fff', borderRadius: 20, padding: 30 },
  input: { height: 50, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 15, fontSize: 16, marginBottom: 15 },
  loginButton: { backgroundColor: '#2563eb', paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  loginButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  jobCard: { flex: 1, margin: 5, backgroundColor: 'white', borderRadius: 15, padding: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  jobCardCustomer: { fontSize: 16, fontWeight: 'bold' },
  jobCardService: { fontSize: 14, color: '#64748b', marginTop: 5 },
  statusBadge: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start', marginTop: 10 },
  statusBadgeText: { fontSize: 12, fontWeight: 'bold' },
  profileCard: { backgroundColor: 'white', margin: 20, padding: 20, borderRadius: 15 },
  profileLabel: { fontSize: 18, color: '#334155', marginBottom: 10 },
  profileValue: { fontWeight: 'bold', color: '#1e293b' },
  changePasswordTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 20, marginBottom: 15, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 15 },
  detailsCard: { backgroundColor: 'white', margin: 20, padding: 20, borderRadius: 15 },
  detailsCustomer: { fontSize: 24, fontWeight: 'bold' },
  detailsPhone: { fontSize: 18, color: '#2563eb', marginVertical: 8 },
  detailsAddress: { fontSize: 16, color: '#334155' },
  detailsLandmark: { fontSize: 14, color: '#64748b', fontStyle: 'italic', marginTop: 4 },
  separator: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 15 },
  detailsService: { fontSize: 18, fontWeight: '500', marginBottom: 20 },
  directionsButton: { backgroundColor: '#16a34a', paddingVertical: 15, borderRadius: 10, alignItems: 'center' },
  statusButtonsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', padding: 20 },
  statusButton: { backgroundColor: 'white', padding: 15, borderRadius: 10, margin: 5, minWidth: 150, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  paymentCard: { backgroundColor: 'white', padding: 20, borderRadius: 15 },
  paymentLabel: { fontSize: 16, fontWeight: '600', color: '#334155', marginBottom: 8 },
  paymentMethodContainer: { flexDirection: 'row', marginBottom: 20 },
  paymentMethodButton: { flex: 1, padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', margin: 5 },
  paymentMethodSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  paymentMethodText: { fontSize: 16, fontWeight: '600' },
  qrCodeContainer: { alignItems: 'center', marginVertical: 20 },
  qrCodeText: { fontSize: 16, color: '#475569', marginBottom: 10 },
  qrCodeImage: { width: 250, height: 250, resizeMode: 'contain' },
  finalizeButton: { backgroundColor: '#16a34a', paddingVertical: 15, borderRadius: 10, alignItems: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, marginBottom: 15, },
  inputField: { flex: 1, height: 50, paddingHorizontal: 15, fontSize: 16, },
  eyeIcon: { padding: 10, }
});

