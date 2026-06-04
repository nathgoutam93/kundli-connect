import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useAppData } from '@/hooks/use-app-data';

const FAMILY_PLAN_OPTIONS = ['Dont want Children', 'Want Children', 'Open to Children', 'Not Sure'];

export default function FamilyPlanningScreen() {
  const { profile, updateProfile } = useAppData();
  const [familyPlans, setFamilyPlans] = useState(profile.familyPlans || 'Want Children');
  const [familyPlansVisibleOnProfile, setFamilyPlansVisibleOnProfile] = useState(
    profile.familyPlansVisibleOnProfile ?? true
  );

  function handleContinue() {
    updateProfile({ familyPlans, familyPlansVisibleOnProfile });
    router.push('/(onboarding)/notifications');
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={27} color="#111111" />
      </Pressable>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>What are your family plans?</Text>

        <View style={styles.optionGroup}>
          {FAMILY_PLAN_OPTIONS.map((option) => {
            const isSelected = familyPlans === option;

            return (
              <Pressable
                key={option}
                style={[styles.option, isSelected && styles.selectedOption]}
                onPress={() => setFamilyPlans(option)}>
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <VisibilityToggle
          value={familyPlansVisibleOnProfile}
          onValueChange={setFamilyPlansVisibleOnProfile}
        />
      </ScrollView>

      <Pressable style={styles.nextButton} onPress={handleContinue}>
        <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
      </Pressable>

    </View>
  );
}

type VisibilityToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

function VisibilityToggle({ value, onValueChange }: VisibilityToggleProps) {
  return (
    <View style={styles.visibilityRow}>
      <Text style={styles.visibilityLabel}>Visible on profile</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E1D7C6', true: '#FBD06D' }}
        thumbColor={value ? '#FCAD00' : '#F8F1E4'}
        ios_backgroundColor="#E1D7C6"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFCF7',
  },
  backButton: {
    position: 'absolute',
    zIndex: 2,
    top: 80,
    left: 28,
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: '#FFFCF7',
    borderWidth: 1,
    borderColor: '#FBD06D',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FCAD00',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 170,
    paddingBottom: 128,
  },
  title: {
    maxWidth: 380,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '500',
    color: '#050505',
  },
  optionGroup: {
    marginTop: 42,
    gap: 18,
  },
  option: {
    height: 55,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFC400',
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    paddingHorizontal: 17,
  },
  selectedOption: {
    borderColor: '#FFD016',
    backgroundColor: '#FFD829',
  },
  optionText: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '400',
    color: '#050505',
  },
  visibilityRow: {
    minHeight: 38,
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  visibilityLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    color: '#55524E',
  },
  nextButton: {
    position: 'absolute',
    right: 19,
    bottom: 40,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FCAD00',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
